import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, ANSWER_MODEL } from "@/lib/anthropic";
import { ANSWER_SYSTEM } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

type InMsg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  let body: { messages?: InMsg[]; webSearch?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const messages = (body.messages ?? []).filter(
    (m) => m && (m.role === "user" || m.role === "assistant") && m.content?.trim(),
  );
  if (messages.length === 0) {
    return new Response("No messages", { status: 400 });
  }

  const webSearch = Boolean(body.webSearch);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        if (!process.env.ANTHROPIC_API_KEY?.trim()) {
          send({
            type: "error",
            message:
              "No ANTHROPIC_API_KEY set on the server. Add it to .env.local and restart the dev server.",
          });
          send({ type: "done" });
          return;
        }

        const tools = webSearch
          ? ([
              { type: "web_search_20260209", name: "web_search", max_uses: 5 },
            ] as unknown as Anthropic.MessageCreateParams["tools"])
          : undefined;

        let convo: Anthropic.MessageParam[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Loop to resume across server-tool `pause_turn` stops.
        for (let turn = 0; turn < 5; turn++) {
          const s = anthropic.messages.stream({
            model: ANSWER_MODEL,
            max_tokens: 8000,
            system: ANSWER_SYSTEM,
            messages: convo,
            thinking: { type: "adaptive", display: "summarized" },
            ...(tools ? { tools } : {}),
          });

          for await (const event of s) {
            if (event.type === "content_block_start") {
              const cb = event.content_block;
              if (cb.type === "server_tool_use") {
                send({ type: "search", status: "start" });
              } else if (cb.type === "web_search_tool_result") {
                send({ type: "search", status: "done" });
              }
            } else if (event.type === "content_block_delta") {
              const d = event.delta;
              if (d.type === "text_delta") {
                send({ type: "text", text: d.text });
              } else if (d.type === "thinking_delta") {
                send({ type: "thinking", text: d.thinking });
              }
            }
          }

          const final = await s.finalMessage();
          if (final.stop_reason === "pause_turn") {
            convo = [...convo, { role: "assistant", content: final.content }];
            continue;
          }
          if (final.stop_reason === "refusal") {
            send({
              type: "error",
              message: "The model declined to answer this request.",
            });
          }
          break;
        }

        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Something went wrong.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
