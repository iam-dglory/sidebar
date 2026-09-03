import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, COACH_MODEL } from "@/lib/anthropic";
import { COACH_SYSTEM } from "@/lib/prompts";
import type { CoachReport, Issue } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type InMsg = { role: "user" | "assistant"; content: string };

function coerceReport(raw: unknown): CoachReport {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return {
    verdict: typeof o.verdict === "string" ? o.verdict : "",
    strengths: strArr(o.strengths),
    issues: Array.isArray(o.issues)
      ? o.issues
          .map((i): Issue => {
            const it = (i ?? {}) as Record<string, unknown>;
            const sev = it.severity;
            return {
              severity:
                sev === "high" || sev === "medium" || sev === "low"
                  ? sev
                  : "medium",
              point: typeof it.point === "string" ? it.point : "",
            };
          })
          .filter((i) => i.point)
      : [],
    improvements: strArr(o.improvements),
    betterApproach:
      typeof o.betterApproach === "string" ? o.betterApproach : "",
    learnNext: Array.isArray(o.learnNext)
      ? o.learnNext
          .map((l) => {
            const it = (l ?? {}) as Record<string, unknown>;
            return {
              topic: typeof it.topic === "string" ? it.topic : "",
              why: typeof it.why === "string" ? it.why : "",
            };
          })
          .filter((l) => l.topic)
      : [],
    followUps: strArr(o.followUps),
  };
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: { messages?: InMsg[]; answer?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const messages = (body.messages ?? []).filter(
    (m) => m && (m.role === "user" || m.role === "assistant") && m.content?.trim(),
  );
  const answer = body.answer?.trim() ?? "";
  if (messages.length === 0 || !answer) {
    return new Response("Nothing to review", { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return new Response(
      "No ANTHROPIC_API_KEY set on the server. Add it to .env.local and restart.",
      { status: 500 },
    );
  }

  const transcript = messages
    .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
    .join("\n\n");

  try {
    const msg = await anthropic.messages.create({
      model: COACH_MODEL,
      max_tokens: 4000,
      system: COACH_SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `CONVERSATION SO FAR:\n\n${transcript}\n\n` +
            `ASSISTANT'S LATEST ANSWER (this is what you are reviewing):\n\n${answer}\n\n` +
            `Produce the JSON review now.`,
        },
      ],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = extractJson(text);
    if (!parsed) {
      return Response.json({
        ...coerceReport({}),
        verdict: text.slice(0, 400) || "Could not generate a review.",
      } satisfies CoachReport);
    }

    return Response.json(coerceReport(parsed) satisfies CoachReport);
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "Review failed",
      { status: 500 },
    );
  }
}
