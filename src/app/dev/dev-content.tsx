"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Terminal,
} from "lucide-react";

// --- Types matching server-side logger + inspector ---

interface LogEntry {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  category: string;
  message: string;
  duration?: number;
}

interface LLMCallRecord {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  step: string;
  durationMs: number;
  status: "success" | "error";
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  responsePreview: string;
  error?: string;
}

interface DevStats {
  total: number;
  byCategory: Record<string, Record<string, number>>;
}

interface LLMStats {
  total: number;
  errors: number;
  totalTokens: number;
  avgDurationMs: number;
}

// --- Color maps ---

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-[var(--color-foreground-muted)]",
  info: "text-[var(--color-info)]",
  warn: "text-[var(--color-warning)]",
  error: "text-[var(--color-destructive)]",
};

const CATEGORY_COLORS: Record<string, string> = {
  ingest: "text-[var(--color-accent)]",
  query: "text-purple-400",
  llm: "text-emerald-400",
  vault: "text-blue-400",
  parse: "text-pink-400",
  system: "text-[var(--color-foreground-muted)]",
};

const LEVEL_ICONS: Record<string, React.ReactNode> = {
  debug: <Search className="h-3 w-3" />,
  info: <CheckCircle2 className="h-3 w-3" />,
  warn: <AlertTriangle className="h-3 w-3" />,
  error: <AlertTriangle className="h-3 w-3" />,
};

// --- Helpers ---

function formatTime(timestamp: string): string {
  return timestamp.split("T")[1]?.split(".")[0] || "--:--";
}

// --- Main Component ---

export function DevContent() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [llmCalls, setLlmCalls] = useState<LLMCallRecord[]>([]);
  const [logStats, setLogStats] = useState<DevStats | null>(null);
  const [llmStats, setLlmStats] = useState<LLMStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dev");
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs || []);
      setLlmCalls(data.llm || []);
      setLogStats(data.stats || null);
      setLlmStats(data.llmStats || null);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleClear = async () => {
    await fetch("/api/dev", { method: "DELETE" });
    setLogs([]);
    setLlmCalls([]);
    setLogStats(null);
    setLlmStats(null);
  };

  // --- Loading skeleton ---

  if (loading && !logStats) {
    return (
      <div className="p-6 space-y-4 max-w-5xl">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-lg bg-[var(--color-muted)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  // --- Render ---

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
            Developer Tools
          </h2>
          <p className="text-xs text-[var(--color-foreground-muted)]">
            Monitor, debug &amp; inspect your knowledge wiki
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs gap-1">
            <Activity className="h-3 w-3" />
            {logStats?.total ?? 0} logs
          </Badge>
          <Badge variant="outline" className="text-xs gap-1">
            <Terminal className="h-3 w-3" />
            {llmCalls.length} LLM calls
          </Badge>
          <Button variant="outline" size="sm" onClick={handleClear}>
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Logs"
          value={logStats?.total ?? 0}
          icon={<Activity className="h-4 w-4 text-[var(--color-info)]" />}
        />
        <StatCard
          label="Errors"
          value={llmStats?.errors ?? 0}
          icon={<AlertTriangle className="h-4 w-4 text-[var(--color-destructive)]" />}
        />
        <StatCard
          label="Tokens"
          value={(llmStats?.totalTokens ?? 0).toLocaleString()}
          icon={<Terminal className="h-4 w-4 text-[var(--color-foreground-muted)]" />}
        />
        <StatCard
          label="Avg Response"
          value={`${llmStats?.avgDurationMs ?? 0}ms`}
          icon={<Clock className="h-4 w-4 text-[var(--color-foreground-muted)]" />}
        />
      </div>

      {/* Activity Feed */}
      <div className="space-y-1">
        <h3 className="text-xs font-semibold text-[var(--color-foreground-muted)] uppercase tracking-wider">
          Recent Activity
        </h3>

        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            {llmCalls.length === 0 && logs.length === 0 && (
              <div className="py-12 text-center text-sm text-[var(--color-foreground-muted)]">
                <Activity className="h-8 w-8 mx-auto opacity-50 mb-2" />
                No activity yet. Ingest a source to see logs.
              </div>
            )}

            {llmCalls.slice(0, 20).map((call) => (
              <LLMCallRow key={call.id} call={call} />
            ))}

            {logs.slice(0, 50).map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-[var(--color-foreground-muted)]">
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className="text-lg font-semibold text-[var(--color-foreground)]">
        {value}
      </p>
    </div>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const time = formatTime(entry.timestamp);
  const color = LEVEL_COLORS[entry.level] || "";
  const catColor = CATEGORY_COLORS[entry.category] || "text-[var(--color-foreground-muted)]";

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-[var(--color-muted)] transition-colors">
      <span className={color}>{LEVEL_ICONS[entry.level]}</span>
      <Badge variant="outline" className="text-[10px]">
        <span className={catColor}>{entry.category}</span>
      </Badge>
      <span
        className="flex-1 text-[11px] text-[var(--color-foreground-secondary)] truncate"
        title={entry.message}
      >
        {entry.message}
      </span>
      {entry.duration !== undefined && (
        <span className="text-[10px] text-[var(--color-foreground-muted)] whitespace-nowrap">
          {entry.duration}ms
        </span>
      )}
      <span className="text-[10px] text-[var(--color-foreground-muted)] whitespace-nowrap">
        {time}
      </span>
    </div>
  );
}

function LLMCallRow({ call }: { call: LLMCallRecord }) {
  const time = formatTime(call.timestamp);

  return (
    <div className="flex flex-col gap-1 px-3 py-2 hover:bg-[var(--color-muted)] transition-colors">
      <div className="flex items-center gap-2">
        {call.status === "success" ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        ) : (
          <AlertTriangle className="h-3 w-3 text-red-500" />
        )}
        <Badge variant="outline" className="text-[10px]">
          {call.step}
        </Badge>
        <span className="text-[10px] text-[var(--color-foreground-muted)]">
          {call.model}
        </span>
        <span className="text-[10px] text-[var(--color-foreground-muted)]">
          {call.durationMs}ms
        </span>
        <span className="text-[10px] text-[var(--color-foreground-muted)]">
          {time}
        </span>
      </div>
      {call.tokenUsage && (
        <div className="text-[10px] text-[var(--color-foreground-muted)] pl-5">
          {call.tokenUsage.totalTokens} tokens ({call.tokenUsage.promptTokens}
          ↑ {call.tokenUsage.completionTokens}↓)
        </div>
      )}
      <p className="text-[10px] text-[var(--color-foreground-secondary)] pl-5 line-clamp-2">
        {call.responsePreview}
      </p>
      {call.error && (
        <p className="text-[10px] text-red-400 pl-5">{call.error}</p>
      )}
    </div>
  );
}
