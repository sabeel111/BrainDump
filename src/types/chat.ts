/**
 * Chat session types for the Knowledge Wiki application.
 * Sessions are stored as markdown files in vault/chat/.
 */

import type { QueryAnswer } from "./llm";

/** A single message within a chat session. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** For assistant messages: structured answer from query engine. */
  answer?: QueryAnswer;
  /** For assistant messages: wiki page slugs cited. */
  citations?: string[];
}

/** Frontmatter stored in each session markdown file. */
export interface ChatSessionFrontmatter {
  title: string;
  created: string;
  updated: string;
  messageCount: number;
  preview: string;
}

/** A full chat session with all messages. */
export interface ChatSession {
  id: string;
  title: string;
  frontmatter: ChatSessionFrontmatter;
  messages: ChatMessage[];
  filePath: string;
}

/** Summary for session list (no message bodies). */
export interface ChatSessionSummary {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  created: string;
  updated: string;
  filePath: string;
}
