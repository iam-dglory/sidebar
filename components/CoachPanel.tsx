"use client";

import type { CoachState } from "@/lib/types";

export default function CoachPanel({
  state,
  onFollowUp,
  onRetry,
}: {
  state: CoachState | undefined;
  onFollowUp: (q: string) => void;
  onRetry: () => void;
}) {
  if (!state || state.status === "idle") {
    return (
      <div className="coach-empty">
        This panel is the second opinion. After each answer it reviews what you
        got — what holds up, what&apos;s wrong or risky, how it could be better,
        and which related concepts are worth learning next.
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="coach-loading">
        <span className="spin" /> Reviewing the answer…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="coach-empty">
        Couldn&apos;t generate a review — {state.message}
        <br />
        <br />
        <button className="icon-btn" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  const r = state.report;

  return (
    <div className="coach-body">
      {r.verdict && <div className="verdict">{r.verdict}</div>}

      {r.issues.length > 0 && (
        <div className="sect issues">
          <h4>What&apos;s off</h4>
          <ul>
            {r.issues.map((it, i) => (
              <li key={i}>
                <span className="sev" data-s={it.severity}>
                  {it.severity}
                </span>
                {it.point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.improvements.length > 0 && (
        <div className="sect">
          <h4>How to make it better</h4>
          <ul>
            {r.improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {r.betterApproach && (
        <div className="sect">
          <h4>A different approach</h4>
          <div className="approach">{r.betterApproach}</div>
        </div>
      )}

      {r.strengths.length > 0 && (
        <div className="sect">
          <h4>What holds up</h4>
          <ul>
            {r.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {r.learnNext.length > 0 && (
        <div className="sect learn">
          <h4>Learn next</h4>
          <ul>
            {r.learnNext.map((l, i) => (
              <li key={i}>
                <span className="topic">{l.topic}</span>
                {l.why && <span className="why">{l.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.followUps.length > 0 && (
        <div className="sect followups">
          <h4>Ask next</h4>
          <ul>
            {r.followUps.map((q, i) => (
              <li key={i}>
                <button onClick={() => onFollowUp(q)}>{q}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
