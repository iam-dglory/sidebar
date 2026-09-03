export type Role = "user" | "assistant";

export interface Issue {
  severity: "high" | "medium" | "low";
  point: string;
}

export interface LearnItem {
  topic: string;
  why: string;
}

export interface CoachReport {
  verdict: string;
  strengths: string[];
  issues: Issue[];
  improvements: string[];
  betterApproach: string;
  learnNext: LearnItem[];
  followUps: string[];
}

export type CoachState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; report: CoachReport }
  | { status: "error"; message: string };

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** summarized reasoning shown while the answer streams (assistant only) */
  thinking?: string;
  /** did this answer use web search */
  searched?: boolean;
  /** the review for this assistant answer */
  coach?: CoachState;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}
