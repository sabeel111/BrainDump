import { NextRequest, NextResponse } from "next/server";
import { processQuery, saveAnswerAsPage } from "@/lib/core/query-engine";
import {
  createSessionWithMessage,
  readSession,
  appendMessage,
} from "@/lib/core/session-manager";
import { randomUUID } from "crypto";
import type { ChatMessage } from "@/types/chat";

/**
 * POST /api/query — Ask a question against the wiki.
 * Streams the response as newline-delimited JSON.
 *
 * Body: { question: string, sessionId?: string }
 * - If sessionId is provided, appends to existing session (multi-turn)
 * - If sessionId is omitted, creates a new session
 */
export async function POST(request: NextRequest) {
  try {
    const { question, saveAsPage, sessionId } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    // Resolve session
    let activeSessionId: string;
    let history: ChatMessage[] | undefined;
    let isNewSession = false;

    if (sessionId) {
      const session = await readSession(sessionId);
      if (session) {
        activeSessionId = sessionId;
        // Append the user message to the session so it's persisted
        const userMessage: ChatMessage = {
          id: randomUUID(),
          role: "user",
          content: question,
          createdAt: new Date().toISOString(),
        };
        const updated = await appendMessage(sessionId, userMessage);
        history = updated.messages;
      } else {
        // Session not found, create new
        const session = await createSessionWithMessage(question);
        activeSessionId = session.id;
        history = [];
        isNewSession = true;
      }
    } else {
      const session = await createSessionWithMessage(question);
      activeSessionId = session.id;
      history = [];
      isNewSession = true;
    }

    const encoder = new TextEncoder();
    const activeId = activeSessionId;

    const stream = new ReadableStream({
      async start(controller) {
        // Emit session ID so client knows which session to track
        if (isNewSession) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "session", sessionId: activeId }) + "\n"
            )
          );
        }

        let answerContent = "";
        let answerData: Record<string, unknown> | null = null;

        for await (const chunk of processQuery(question, history)) {
          controller.enqueue(
            encoder.encode(JSON.stringify(chunk) + "\n")
          );

          if (chunk.type === "stream" && chunk.content) {
            // Accumulate tokens for the final session save
            answerContent += chunk.content;
          }

          if (chunk.type === "answer") {
            answerContent = chunk.content || answerContent;
            answerData = chunk.answer
              ? {
                  answer: chunk.answer.answer,
                  citations: chunk.answer.citations,
                  suggestedTitle: chunk.answer.suggestedTitle,
                  suggestedCategory: chunk.answer.suggestedCategory,
                }
              : null;
          }
        }

        // Append assistant response to session
        if (answerContent) {
          const assistantMessage: ChatMessage = {
            id: randomUUID(),
            role: "assistant",
            content: answerContent,
            createdAt: new Date().toISOString(),
            answer: answerData as unknown as ChatMessage["answer"],
            citations: (answerData as { citations?: string[] })?.citations,
          };
          try {
            await appendMessage(activeId, assistantMessage);
          } catch {
            // session save failure shouldn't break the response
          }
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      { status: 500 }
    );
  }
}
