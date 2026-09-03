import Anthropic from "@anthropic-ai/sdk";

// Fall back to an empty key so the app still boots without env vars —
// requests then fail with a clear 401 instead of a module-load crash.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export const ANSWER_MODEL = process.env.SIDEBAR_MODEL?.trim() || "claude-opus-5";
export const COACH_MODEL =
  process.env.SIDEBAR_COACH_MODEL?.trim() || ANSWER_MODEL;
