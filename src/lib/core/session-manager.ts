/**
 * Session manager — CRUD for chat sessions.
 * Sessions stored as markdown files in vault/chat/.
 * Framework-independent (pure Node.js + gray-matter).
 */

import { randomUUID } from "crypto";
import matter from "gray-matter";
import {
  readVaultFile,
  writeVaultFile,
  deleteVaultFile,
  listVaultFilesRecursive,
  vaultFileExists,
} from "./vault";
import { slugify } from "../markdown/parser";
import { log } from "./logger";
import type {
  ChatMessage,
  ChatSession,
  ChatSessionSummary,
  ChatSessionFrontmatter,
} from "@/types";

// ============================================================
// CREATE
// ============================================================

/** Create a new empty chat session. */
export async function createSession(title?: string): Promise<ChatSession> {
  const now = new Date().toISOString();
  const sessionTitle = title || "New Conversation";
  const id = generateSessionId(sessionTitle);

  const frontmatter: ChatSessionFrontmatter = {
    title: sessionTitle,
    created: now,
    updated: now,
    messageCount: 0,
    preview: "",
  };

  const session: ChatSession = {
    id,
    title: sessionTitle,
    frontmatter,
    messages: [],
    filePath: `chat/${id}.md`,
  };

  await writeVaultFile(session.filePath, serializeSession(session));
  log.info("session", `Created session: ${id}`);
  return session;
}

/** Create a session with the first user message (auto-titled). */
export async function createSessionWithMessage(
  userContent: string
): Promise<ChatSession> {
  const title = generateTitle(userContent);
  const session = await createSession(title);
  const userMessage: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content: userContent,
    createdAt: new Date().toISOString(),
  };
  return appendMessage(session.id, userMessage);
}

// ============================================================
// READ
// ============================================================

/** Read a full session by ID, including all messages. */
export async function readSession(
  sessionId: string
): Promise<ChatSession | null> {
  const filePath = `chat/${sessionId}.md`;
  if (!(await vaultFileExists(filePath))) return null;

  const raw = await readVaultFile(filePath);
  return parseSessionFile(raw, filePath);
}

/** List all sessions as summaries (no message bodies), most recent first. */
export async function listSessions(): Promise<ChatSessionSummary[]> {
  const files = await listVaultFilesRecursive("chat", ".md");
  const summaries: ChatSessionSummary[] = [];

  for (const file of files) {
    const filePath = `chat/${file}`;
    try {
      const raw = await readVaultFile(filePath);
      const parsed = matter(raw);
      const id = file.replace(/\.md$/, "");
      summaries.push({
        id,
        title: parsed.data.title || "Untitled",
        preview: parsed.data.preview || "",
        messageCount: parsed.data.messageCount || 0,
        created: parsed.data.created || new Date().toISOString(),
        updated: parsed.data.updated || new Date().toISOString(),
        filePath,
      });
    } catch {
      // skip unreadable files
    }
  }

  // Most recent first
  summaries.sort(
    (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
  );
  return summaries;
}

// ============================================================
// UPDATE
// ============================================================

/** Update session title. */
export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<ChatSession | null> {
  const session = await readSession(sessionId);
  if (!session) return null;

  session.title = title;
  session.frontmatter.title = title;
  await writeVaultFile(session.filePath, serializeSession(session));
  return session;
}

// ============================================================
// DELETE
// ============================================================

/** Delete a session. */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const filePath = `chat/${sessionId}.md`;
  if (!(await vaultFileExists(filePath))) return false;
  await deleteVaultFile(filePath);
  log.info("session", `Deleted session: ${sessionId}`);
  return true;
}

// ============================================================
// APPEND MESSAGE
// ============================================================

/** Append a message to a session and save. Returns the updated session. */
export async function appendMessage(
  sessionId: string,
  message: ChatMessage
): Promise<ChatSession> {
  const session = await readSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  session.messages.push(message);
  session.frontmatter.messageCount = session.messages.length;
  session.frontmatter.updated = new Date().toISOString();

  // Update preview from first user message
  if (message.role === "user" && !session.frontmatter.preview) {
    session.frontmatter.preview = message.content.substring(0, 80);
  }

  // Auto-title from first user message if still default
  if (
    message.role === "user" &&
    session.title === "New Conversation"
  ) {
    session.title = generateTitle(message.content);
    session.frontmatter.title = session.title;
  }

  await writeVaultFile(session.filePath, serializeSession(session));
  return session;
}

// ============================================================
// SERIALIZATION
// ============================================================

/** Parse a session markdown file into a ChatSession. */
function parseSessionFile(rawContent: string, filePath: string): ChatSession {
  const parsed = matter(rawContent);
  const id = filePath.replace("chat/", "").replace(".md", "");
  const messages = parseMessages(parsed.content);

  return {
    id,
    title: parsed.data.title || "Untitled",
    frontmatter: {
      title: parsed.data.title || "Untitled",
      created: parsed.data.created || new Date().toISOString(),
      updated: parsed.data.updated || new Date().toISOString(),
      messageCount: parsed.data.messageCount || messages.length,
      preview: parsed.data.preview || "",
    },
    messages,
    filePath,
  };
}

/** Serialize a ChatSession to markdown file content. */
function serializeSession(session: ChatSession): string {
  const fm: Record<string, unknown> = {
    title: session.frontmatter.title,
    created: session.frontmatter.created,
    updated: session.frontmatter.updated,
    messageCount: session.frontmatter.messageCount,
    preview: session.frontmatter.preview,
  };

  const body = session.messages
    .map((msg) => {
      let section = `## ${msg.role}\n\n${msg.content}`;
      // Preserve QueryAnswer for assistant messages
      if (msg.role === "assistant" && msg.answer) {
        const encoded = Buffer.from(
          JSON.stringify(msg.answer)
        ).toString("base64");
        section += `\n\n<!-- answer:${encoded} -->`;
      }
      return section;
    })
    .join("\n\n");

  return matter.stringify(body, fm);
}

/** Parse messages from the markdown body. */
function parseMessages(body: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  // Split on ## user or ## assistant headings
  const sections = body.split(/^## (user|assistant)\s*$/m);

  // sections[0] is before first heading (empty or whitespace)
  // sections[1] = role, sections[2] = content, sections[3] = role, ...
  for (let i = 1; i < sections.length; i += 2) {
    const role = sections[i].trim() as "user" | "assistant";
    const content = (sections[i + 1] || "").trim();
    if (!content) continue;

    const msg: ChatMessage = {
      id: randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
    };

    // Extract answer from HTML comment for assistant messages
    if (role === "assistant") {
      const answerMatch = content.match(
        /<!-- answer:([A-Za-z0-9+/=]+) -->/
      );
      if (answerMatch) {
        try {
          msg.answer = JSON.parse(
            Buffer.from(answerMatch[1], "base64").toString("utf-8")
          );
          msg.citations = msg.answer?.citations || [];
          // Remove the comment from displayed content
          msg.content = content.replace(
            /<!-- answer:[A-Za-z0-9+/=]+ -->/,
            ""
          ).trim();
        } catch {
          // couldn't decode, keep content as-is
        }
      }
    }

    messages.push(msg);
  }
  return messages;
}

// ============================================================
// HELPERS
// ============================================================

function generateSessionId(title: string): string {
  const slug = slugify(title.substring(0, 50));
  const hash = randomUUID().substring(0, 4);
  return `${slug}-${hash}`;
}

function generateTitle(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 60) return trimmed;
  // Truncate at word boundary
  const truncated = trimmed.substring(0, 57);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 30 ? truncated.substring(0, lastSpace) + "..." : truncated + "...";
}
