"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { SessionList } from "@/components/chat/session-list";
import { useChat } from "@/hooks/use-chat";

export function ChatContent() {
  const {
    sessions,
    sessionsLoading,
    activeSession,
    activeSessionId,
    selectSession,
    createNewSession,
    deleteSessionById,
    handleSessionCreated,
    handleSessionUpdated,
  } = useChat();

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Session Sidebar */}
      <SessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={selectSession}
        onNewSession={createNewSession}
        onDeleteSession={deleteSessionById}
        loading={sessionsLoading}
      />

      {/* Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatPanel
          session={activeSession}
          sessionId={activeSessionId}
          onSessionCreated={handleSessionCreated}
          onSessionUpdated={handleSessionUpdated}
        />
      </div>
    </div>
  );
}
