"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal, Loader2, MessageSquare } from "lucide-react";
import { ChatMessage } from "./chat-message";
import { toast } from "react-hot-toast";
import type { QueryAnswer } from "@/types";
import type { ChatSession, ChatMessage as ChatMessageType } from "@/types/chat";

interface DisplayMessage extends ChatMessageType {
  isStreaming?: boolean;
}

interface ChatPanelProps {
  session: ChatSession | null;
  sessionId: string | null;
  onSessionCreated: (sessionId: string) => void;
  onSessionUpdated: () => void;
}

export function ChatPanel({
  session,
  sessionId,
  onSessionCreated,
  onSessionUpdated,
}: ChatPanelProps) {
  // Only used for messages not yet in a session (streaming / optimistic)
  const [streamingMessages, setStreamingMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingText, setThinkingText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // When session changes externally (e.g. clicking a different session in sidebar),
  // clear streaming messages. But NOT when a new session is created mid-stream —
  // in that case isLoading is true and the streaming messages ARE the content.
  // We use a ref to get the current loading state synchronously inside the effect.
  const isLoadingRef = useRef(false);
  isLoadingRef.current = isLoading;

  useEffect(() => {
    if (!isLoadingRef.current) {
      setStreamingMessages([]);
    }
  }, [sessionId]);

  // Build final message list:
  // - During streaming (isLoading): show past session.messages PLUS the current
  //   turn's streamingMessages. No duplication risk because session.messages is
  //   loaded before the new question was sent (it doesn't contain the optimistic
  //   user message). For new sessions, session is null so only streamingMessages show.
  // - After streaming: show session.messages from the loaded session data.
  const messages: DisplayMessage[] = isLoading
    ? [...(session?.messages || []), ...streamingMessages]
    : session
      ? session.messages
      : streamingMessages;

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userContent = input.trim();

    // Optimistic user message
    const optimisticUser: DisplayMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: userContent,
      createdAt: new Date().toISOString(),
    };

    // Streaming assistant placeholder
    const assistantId = `local-assistant-${Date.now()}`;
    const assistantPlaceholder: DisplayMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };

    setStreamingMessages([optimisticUser, assistantPlaceholder]);
    setInput("");
    setIsLoading(true);
    setThinkingText("Analyzing your question...");
    scrollToBottom();

    try {
      abortRef.current = new AbortController();

      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userContent,
          sessionId: sessionId || undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error("Query failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let fullContent = "";
      let answer: QueryAnswer | undefined;
      let hasStartedStreaming = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const chunk = JSON.parse(line);

            if (chunk.type === "session") {
              onSessionCreated(chunk.sessionId);
            } else if (chunk.type === "thinking") {
              setThinkingText(chunk.content);
            } else if (chunk.type === "stream") {
              // Real-time token — append to assistant message
              if (!hasStartedStreaming) {
                hasStartedStreaming = true;
                setThinkingText(null);
              }
              fullContent += chunk.content;
              setStreamingMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: fullContent }
                    : m
                )
              );
              scrollToBottom();
            } else if (chunk.type === "answer") {
              // Final complete answer with metadata
              answer = chunk.answer;
              setStreamingMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: chunk.content || fullContent,
                        answer,
                        citations: answer?.citations,
                        isStreaming: false,
                      }
                    : m
                )
              );
              scrollToBottom();
            } else if (chunk.type === "error") {
              toast.error(chunk.content || "An error occurred");
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // Reload session to get persisted messages, then clear streaming.
      // Must await so that session is loaded BEFORE we clear streamingMessages
      // and set isLoading=false — otherwise there's a flash of empty state.
      try {
        await onSessionUpdated();
      } catch {
        // non-critical — session refresh can be retried later
      }
      setStreamingMessages([]);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error(error instanceof Error ? error.message : "Query failed");
        setStreamingMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "An error occurred. Please try again.", isStreaming: false }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      setThinkingText(null);
    }
  }, [input, isLoading, sessionId, onSessionCreated, onSessionUpdated, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-foreground-muted)]">
            <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-base font-medium mb-1 text-[var(--color-foreground-secondary)]">
              Start a conversation
            </p>
            <p className="text-sm max-w-sm text-center">
              Ask questions about your knowledge base. Conversations are saved automatically.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            isStreaming={message.isStreaming}
          />
        ))}

        {thinkingText && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-foreground-muted)] animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin" />
            {thinkingText}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[var(--color-outline-variant)]/20 p-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your wiki..."
            rows={1}
            className="min-h-[44px] max-h-[200px] resize-none bg-[var(--color-surface-container-high)] border-[var(--color-outline-variant)]/20 text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-muted)] focus-visible:ring-[#fbe0a3]/30"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="flex-shrink-0 bg-gradient-to-r from-[#fbe0a3] to-[#f5c84c] text-[#091426] hover:from-[#f5c84c] hover:to-[#fbe0a3]"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
