"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatSession, ChatSessionSummary } from "@/types/chat";

/**
 * Hook for managing chat sessions.
 * Handles session listing, selection, creation, deletion.
 */
export function useChat() {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);

  // Ref to always read the latest activeSessionId inside callbacks
  // without creating stale closures (critical for handleSessionUpdated).
  const activeSessionIdRef = useRef<string | null>(null);
  activeSessionIdRef.current = activeSessionId;

  // Fetch session list
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  // Select a session (load full messages)
  const selectSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(`/api/chat?sessionId=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setActiveSession(data);
          setActiveSessionId(sessionId);
        }
      } catch {
        // ignore
      }
    },
    []
  );

  // Create new session
  const createNewSession = useCallback(async () => {
    setActiveSession(null);
    setActiveSessionId(null);
  }, []);

  // Delete session
  const deleteSessionById = useCallback(
    async (sessionId: string) => {
      await fetch(`/api/chat?sessionId=${sessionId}`, { method: "DELETE" });
      if (activeSessionId === sessionId) {
        setActiveSession(null);
        setActiveSessionId(null);
      }
      await fetchSessions();
    },
    [activeSessionId, fetchSessions]
  );

  // Handle session created mid-stream.
  // ONLY sets the ID and refreshes sidebar — does NOT load session data.
  // Loading session data during streaming causes duplicate user messages
  // (server's persisted user msg + client's optimistic user msg both visible).
  // The session will be fully loaded in handleSessionUpdated after streaming completes.
  const handleSessionCreated = useCallback(
    async (sessionId: string) => {
      setActiveSessionId(sessionId);
      // Refresh sidebar only — do NOT setActiveSession here
      await fetchSessions();
    },
    [fetchSessions]
  );

  // Handle session updated (after streaming completes).
  // NOW it's safe to load the full session with all persisted messages.
  const handleSessionUpdated = useCallback(async () => {
    // Read from ref to always get the latest activeSessionId,
    // even when called from a stale closure in handleSend.
    const id = activeSessionIdRef.current;
    if (id) {
      await selectSession(id);
      await fetchSessions();
    }
  }, [selectSession, fetchSessions]);

  // Load sessions on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    sessionsLoading,
    activeSession,
    activeSessionId,
    selectSession,
    createNewSession,
    deleteSessionById,
    handleSessionCreated,
    handleSessionUpdated,
  };
}
