"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Markdown from "@/components/Markdown";
import CoachPanel from "@/components/CoachPanel";
import {
  loadConversations,
  newConversation,
  saveConversations,
  titleFrom,
} from "@/lib/store";
import type { ChatMessage, Conversation } from "@/lib/types";

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36));

const EXAMPLES = [
  "Build me a LinkedIn headline and About section that gets recruiters to reach out. Background: 3 years frontend, moving into ML.",
  "My manager keeps reassigning my projects mid-way. How should I bring it up in our next 1:1?",
  "Explain how database indexes actually work, and when they hurt.",
  "I'm learning prompt engineering. Where should I start and what order?",
];

type ApiMsg = { role: "user" | "assistant"; content: string };

export default function Page() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [railVisible, setRailVisible] = useState(true);
  const [coachVisible, setCoachVisible] = useState(true);
  const [pickedAssistantId, setPickedAssistantId] = useState<string | null>(null);

  const hydrated = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  /* ---------- persistence ---------- */
  useEffect(() => {
    const list = loadConversations();
    setConvos(list);
    if (list[0]) setActiveId(list[0].id);
    hydrated.current = true;
    if (window.matchMedia("(max-width: 1080px)").matches) {
      setRailVisible(false);
      setCoachVisible(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => saveConversations(convos), 400);
    return () => clearTimeout(t);
  }, [convos]);

  /* ---------- derived ---------- */
  const active = useMemo(
    () => convos.find((c) => c.id === activeId) ?? null,
    [convos, activeId],
  );

  const railList = useMemo(
    () => [...convos].sort((a, b) => b.updatedAt - a.updatedAt),
    [convos],
  );

  const coachMsg = useMemo(() => {
    if (!active) return undefined;
    const picked = active.messages.find((m) => m.id === pickedAssistantId);
    if (picked) return picked;
    const asst = active.messages.filter((m) => m.role === "assistant");
    return asst[asst.length - 1];
  }, [active, pickedAssistantId]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.messages]);

  /* ---------- mutations ---------- */
  const patchMsg = useCallback(
    (
      convId: string,
      msgId: string,
      fn: (m: ChatMessage) => Partial<ChatMessage>,
    ) => {
      setConvos((prev) =>
        prev.map((c) =>
          c.id !== convId
            ? c
            : {
                ...c,
                updatedAt: Date.now(),
                messages: c.messages.map((m) =>
                  m.id === msgId ? { ...m, ...fn(m) } : m,
                ),
              },
        ),
      );
    },
    [],
  );

  const runCoach = useCallback(
    async (
      convId: string,
      msgId: string,
      history: ApiMsg[],
      answer: string,
    ) => {
      patchMsg(convId, msgId, () => ({ coach: { status: "loading" } }));
      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, answer }),
        });
        if (!res.ok) {
          throw new Error((await res.text()) || `HTTP ${res.status}`);
        }
        const report = await res.json();
        patchMsg(convId, msgId, () => ({
          coach: { status: "done", report },
        }));
      } catch (err) {
        patchMsg(convId, msgId, () => ({
          coach: {
            status: "error",
            message: err instanceof Error ? err.message : "unknown error",
          },
        }));
      }
    },
    [patchMsg],
  );

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || streaming) return;
      setInput("");
      if (taRef.current) taRef.current.style.height = "auto";

      let conv = activeId ? convos.find((c) => c.id === activeId) : undefined;
      let created: Conversation | null = null;
      if (!conv) {
        created = newConversation();
        conv = created;
      }
      const convId = conv.id;
      const priorMessages = conv.messages;

      const userMsg: ChatMessage = { id: uid(), role: "user", content };
      const asstMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: "",
        coach: { status: "idle" },
      };

      setConvos((prev) => {
        const base = created ? [created!, ...prev] : prev;
        return base.map((c) =>
          c.id !== convId
            ? c
            : {
                ...c,
                title:
                  c.messages.length === 0 ? titleFrom(content) : c.title,
                updatedAt: Date.now(),
                messages: [...c.messages, userMsg, asstMsg],
              },
        );
      });
      if (created) setActiveId(convId);
      setPickedAssistantId(asstMsg.id);
      if (window.matchMedia("(max-width: 1080px)").matches) {
        setCoachVisible(false);
      }
      setStreaming(true);

      const history: ApiMsg[] = [...priorMessages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const ac = new AbortController();
      abortRef.current = ac;
      let acc = "";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, webSearch }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let evt: Record<string, unknown>;
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }
            if (evt.type === "text") {
              acc += String(evt.text ?? "");
              patchMsg(convId, asstMsg.id, () => ({ content: acc }));
            } else if (evt.type === "thinking") {
              patchMsg(convId, asstMsg.id, (m) => ({
                thinking: (m.thinking ?? "") + String(evt.text ?? ""),
              }));
            } else if (evt.type === "search" && evt.status === "start") {
              patchMsg(convId, asstMsg.id, () => ({ searched: true }));
            } else if (evt.type === "error") {
              throw new Error(String(evt.message ?? "stream error"));
            }
          }
        }
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        patchMsg(convId, asstMsg.id, (m) => ({
          content: aborted
            ? m.content + "\n\n_(stopped)_"
            : m.content ||
              `⚠️ ${err instanceof Error ? err.message : "Request failed"}`,
        }));
        setStreaming(false);
        abortRef.current = null;
        return;
      }

      setStreaming(false);
      abortRef.current = null;

      if (acc.trim()) {
        runCoach(convId, asstMsg.id, history, acc);
      }
    },
    [activeId, convos, streaming, webSearch, patchMsg, runCoach],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retryCoach = useCallback(() => {
    if (!active || !coachMsg) return;
    const idx = active.messages.findIndex((m) => m.id === coachMsg.id);
    if (idx < 0) return;
    const history: ApiMsg[] = active.messages
      .slice(0, idx)
      .map((m) => ({ role: m.role, content: m.content }));
    runCoach(active.id, coachMsg.id, history, coachMsg.content);
  }, [active, coachMsg, runCoach]);

  const startNew = useCallback(() => {
    setActiveId(null);
    setPickedAssistantId(null);
    setInput("");
    if (window.matchMedia("(max-width: 1080px)").matches) setRailVisible(false);
    taRef.current?.focus();
  }, []);

  const deleteConv = useCallback(
    (id: string) => {
      setConvos((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setPickedAssistantId(null);
      }
    },
    [activeId],
  );

  const isMobile = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1080px)").matches;

  /* ---------- render ---------- */
  const messages = active?.messages ?? [];

  return (
    <div
      className="shell"
      data-rail={railVisible ? "open" : "hidden"}
      data-coach={coachVisible ? "open" : "hidden"}
    >
      <header className="head">
        <button
          className="icon-btn"
          onClick={() => setRailVisible((v) => !v)}
          title="Toggle chat list"
        >
          ☰
        </button>
        <div className="brand">
          <span className="dot" />
          Sidebar
          <small>every answer, plus a second opinion</small>
        </div>
        <div className="spacer" />
        <button
          className="icon-btn"
          data-on={coachVisible}
          onClick={() => setCoachVisible((v) => !v)}
          title="Toggle the review panel"
        >
          ◧ Second opinion
        </button>
      </header>

      <aside className="rail">
        <div className="rail-head">
          <button className="new-btn" onClick={startNew}>
            + New chat
          </button>
        </div>
        <div className="rail-list">
          {railList.map((c) => (
            <button
              key={c.id}
              className="rail-item"
              data-active={c.id === activeId}
              onClick={() => {
                setActiveId(c.id);
                setPickedAssistantId(null);
                if (isMobile()) setRailVisible(false);
              }}
            >
              <span>{c.title}</span>
              <span
                className="del"
                role="button"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConv(c.id);
                }}
              >
                ×
              </span>
            </button>
          ))}
          {railList.length === 0 && (
            <div style={{ padding: "10px 12px", color: "var(--text-faint)", fontSize: 13 }}>
              No chats yet.
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <div className="thread" ref={threadRef}>
          {messages.length === 0 ? (
            <div className="hero">
              <h1>Ask anything. Then read the second opinion.</h1>
              <p>
                The left panel answers like any assistant. The right panel
                reviews that answer — what&apos;s right, what&apos;s wrong, how
                to do it better, and what to learn next.
              </p>
              <div className="examples">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => send(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="thread-inner">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`msg ${m.role}`}
                  onClick={() => {
                    if (m.role === "assistant") {
                      setPickedAssistantId(m.id);
                      if (isMobile()) setCoachVisible(true);
                    }
                  }}
                >
                  <div className="who">
                    {m.role === "user" ? "You" : "Sidebar"}
                  </div>

                  {m.role === "assistant" && m.thinking && (
                    <details className="thinking">
                      <summary>Reasoning</summary>
                      {m.thinking}
                    </details>
                  )}

                  {m.role === "assistant" && m.searched && (
                    <div className="pill">🌐 searched the web</div>
                  )}

                  <div className="bubble">
                    {m.role === "assistant" ? (
                      <>
                        <Markdown>{m.content}</Markdown>
                        {streaming &&
                          m.id === messages[messages.length - 1]?.id &&
                          !m.content && <span className="pill">thinking…</span>}
                        {streaming &&
                          m.id === messages[messages.length - 1]?.id &&
                          m.content && <span className="cursor" />}
                        {m.coach?.status === "loading" && (
                          <div
                            className="pill"
                            style={{ marginTop: 8, cursor: "pointer" }}
                            onClick={() => setCoachVisible(true)}
                          >
                            <span className="spin" /> writing the review…
                          </div>
                        )}
                        {m.coach?.status === "done" && (
                          <div
                            className="pill"
                            style={{
                              marginTop: 8,
                              cursor: "pointer",
                              borderColor: "var(--coach-soft)",
                              color: "var(--coach)",
                            }}
                            onClick={() => {
                              setPickedAssistantId(m.id);
                              setCoachVisible(true);
                            }}
                          >
                            ◧ second opinion ready
                          </div>
                        )}
                      </>
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="composer">
          <div className="composer-inner">
            <div className="composer-row">
              <button
                className="toggle"
                data-on={webSearch}
                onClick={() => setWebSearch((v) => !v)}
                title="Let the assistant search the web"
              >
                🌐 Web search {webSearch ? "on" : "off"}
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                ref={taRef}
                value={input}
                rows={1}
                placeholder="Ask a question, or describe your situation…"
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 180) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
              />
              {streaming ? (
                <button
                  type="button"
                  className="send"
                  onClick={stop}
                  title="Stop"
                >
                  ■
                </button>
              ) : (
                <button
                  type="submit"
                  className="send"
                  disabled={!input.trim()}
                  title="Send"
                >
                  ↑
                </button>
              )}
            </form>
          </div>
        </div>
      </main>

      <aside className="coach">
        <div className="coach-head">
          <span className="tag">◧ The Sidebar</span>
          <small>second opinion on the answer</small>
        </div>
        <CoachPanel
          state={coachMsg?.coach}
          onFollowUp={(q) => {
            if (isMobile()) setCoachVisible(false);
            send(q);
          }}
          onRetry={retryCoach}
        />
      </aside>

      <div
        className="scrim"
        onClick={() => {
          setRailVisible(false);
          setCoachVisible(false);
        }}
      />
    </div>
  );
}
