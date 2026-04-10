"use client";

import Link from "next/link";
import { WikiPageViewer } from "../wiki/wiki-page-viewer";
import { Button } from "@/components/ui/button";
import { Save, User, Bot } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  const handleSaveToWiki = async () => {
    if (!message.answer?.suggestedTitle) return;

    try {
      const res = await fetch("/api/wiki", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: message.answer.suggestedTitle,
          category: message.answer.suggestedCategory || "topics",
          content: message.content,
          tags: message.answer.citations,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      toast.success("Saved to wiki!");
    } catch {
      toast.error("Failed to save to wiki");
    }
  };

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-[#091426] text-white"
            : "bg-[var(--color-surface-container-highest)] text-[var(--color-foreground-secondary)]"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn("max-w-[80%] space-y-2", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-lg px-4 py-3",
            isUser
              ? "bg-[#091426] text-white"
              : "bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]/20"
          )}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : message.content ? (
            <div className="wiki-content text-sm text-[var(--color-foreground)] inline">
              <WikiPageViewer content={message.content} />
              {isStreaming && (
                <span className="inline-block w-[2px] h-[1em] bg-[#fbe0a3] ml-0.5 animate-pulse align-text-bottom" />
              )}
            </div>
          ) : isStreaming ? (
            <div className="flex items-center gap-1.5 text-sm text-[var(--color-foreground-muted)]">
              <span className="inline-block w-[2px] h-[1em] bg-[#fbe0a3] animate-pulse" />
            </div>
          ) : null}
        </div>

        {/* Citations */}
        {!isUser && message.answer?.citations && message.answer.citations.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.answer.citations.map((slug) => (
              <Link
                key={slug}
                href={`/wiki/${slug}`}
                className="text-xs text-[#fbe0a3] hover:underline"
              >
                [[{slug}]]
              </Link>
            ))}
          </div>
        )}

        {/* Save button */}
        {!isUser && message.answer?.suggestedTitle && !isStreaming && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveToWiki}
            className="text-xs"
          >
            <Save className="mr-1 h-3 w-3" />
            Save to wiki as &quot;{message.answer.suggestedTitle}&quot;
          </Button>
        )}

        {/* Streaming indicator */}
        {isStreaming && !message.content && (
          <span className="text-xs text-[var(--color-foreground-muted)] animate-pulse">Generating...</span>
        )}
      </div>
    </div>
  );
}
