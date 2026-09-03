# Sidebar

A two-panel chatbot. The **left** panel answers your question like any assistant
(streaming, Markdown, optional web search). The **right** panel — _the Sidebar_ —
reviews that answer and gives you the perspective you wouldn't otherwise get:

- **What's off** — errors, risks, missing caveats, ranked by severity
- **How to make it better** — concrete, specific upgrades
- **A different approach** — when the answer isn't the best way in
- **What holds up** — what's actually solid
- **Learn next** — adjacent concepts worth studying, each with a reason
- **Ask next** — sharp follow-up questions (click to send)

Works for knowledge questions _and_ real situations — "build me a LinkedIn
profile", "here's what's happening at work", "review this code".

## Stack

Next.js 16 (App Router) · React 19 · Anthropic SDK · TypeScript. No database —
conversations live in `localStorage`.

## Setup

```bash
cd sidebar
npm install
cp .env.example .env.local     # then add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000

### Environment

| Var | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | https://console.anthropic.com/settings/keys |
| `SIDEBAR_MODEL` | no | `claude-opus-5` | Main answer model. Use `claude-sonnet-5` for faster/cheaper replies. |
| `SIDEBAR_COACH_MODEL` | no | = `SIDEBAR_MODEL` | Model for the review panel. |

## How it works

1. `POST /api/chat` streams the answer (newline-delimited JSON events:
   `text`, `thinking`, `search`, `error`, `done`). Web search uses Anthropic's
   server-side `web_search` tool; `pause_turn` stops are resumed automatically.
2. When the answer finishes, the client calls `POST /api/coach` with the
   transcript + the answer. The coach model returns a structured JSON review
   that the right panel renders.

## Deploy

Push to a repo and import into Vercel. Set the env vars in the Vercel project
settings. `maxDuration` on both routes is 60s — fine on Vercel's default plan.
