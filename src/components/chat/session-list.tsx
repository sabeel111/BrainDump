"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, MessageSquare, Trash2, X } from "lucide-react";
import type { ChatSessionSummary } from "@/types/chat";

interface SessionListProps {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  loading: boolean;
}

function groupByDate(sessions: ChatSessionSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, ChatSessionSummary[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Older: [],
  };

  for (const s of sessions) {
    const d = new Date(s.updated);
    if (d >= today) groups["Today"].push(s);
    else if (d >= yesterday) groups["Yesterday"].push(s);
    else if (d >= weekAgo) groups["This Week"].push(s);
    else groups["Older"].push(s);
  }

  return Object.entries(groups).filter(([, items]) => items.length > 0);
}

export function SessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  loading,
}: SessionListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const groups = groupByDate(sessions);

  if (loading) {
    return (
      <div className="w-64 flex-shrink-0 border-r border-[var(--surface-ghost)] flex flex-col bg-[var(--surface-1)]">
        <div className="p-3">
          <div className="h-9 rounded-lg bg-[var(--surface-2)] animate-pulse" />
        </div>
        <div className="flex-1 p-3 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-[var(--surface-2)] animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 border-r border-[var(--surface-ghost)] flex flex-col bg-[var(--surface-1)]">
      {/* New Conversation Button */}
      <div className="p-3">
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
            bg-gradient-to-r from-[#fbe0a3] to-[#f5c84c] text-[#091426]
            hover:from-[#f5c84c] hover:to-[#fbe0a3] transition-all
            shadow-[0_2px_8px_rgba(251,224,163,0.2)]"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {groups.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]">
            No conversations yet
          </div>
        )}

        {groups.map(([label, items]) => (
          <div key={label}>
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              {label}
            </div>
            {items.map((session) => {
              const isActive = session.id === activeSessionId;
              const isHovered = session.id === hoveredId;
              return (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors relative
                    ${isActive
                      ? "bg-[var(--surface-3)] border-l-2 border-[#fbe0a3] pl-[10px]"
                      : "hover:bg-[var(--surface-2)]"
                    }`}
                  onClick={() => onSelectSession(session.id)}
                  onMouseEnter={() => setHoveredId(session.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-tertiary)]" />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-xs font-medium truncate ${isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
                    >
                      {session.title}
                    </div>
                    {session.messageCount > 0 && (
                      <div className="text-[10px] text-[var(--text-tertiary)]">
                        {session.messageCount} messages
                      </div>
                    )}
                  </div>
                  {(isHovered || isActive) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="p-1 rounded hover:bg-[var(--surface-ghost)] text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
