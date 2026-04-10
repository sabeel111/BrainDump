/**
 * Structured logging system for the Knowledge Wiki.
 * Provides categorized, timestamped, queryable logs.
 * Logs are stored in memory and optionally persisted to disk.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogCategory = "ingest" | "query" | "llm" | "vault" | "parse" | "system" | "pipeline" | "session";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
  duration?: number;      // ms if this is a timed operation
  jobId?: string;         // link to ingest job
  llmCallId?: string;     // link to LLM call
}

// In-memory log store (ring buffer — keeps last 2000 entries)
const MAX_LOG_ENTRIES = 2000;
const logBuffer: LogEntry[] = [];
let logIdCounter = 0;

// Subscribers for real-time updates
type LogListener = (entry: LogEntry) => void;
const listeners: Set<LogListener> = new Set();

function generateId(): string {
  return `${Date.now()}-${++logIdCounter}`;
}

function addLog(level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>): LogEntry {
  const entry: LogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    data,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift();
  }

  // Notify subscribers
  for (const listener of listeners) {
    try { listener(entry); } catch { /* ignore listener errors */ }
  }

  // Also console.log for development
  const prefix = `[${entry.timestamp.split("T")[1]?.split(".")[0]}] [${level.toUpperCase()}] [${category}]`;
  const dataStr = data ? ` ${JSON.stringify(data)}` : "";
  switch (level) {
    case "error": console.error(`❌ ${prefix} ${message}${dataStr}`); break;
    case "warn":  console.warn(`⚠️  ${prefix} ${message}${dataStr}`); break;
    case "debug": console.debug(`🔍 ${prefix} ${message}${dataStr}`); break;
    default:      console.log(`ℹ️  ${prefix} ${message}${dataStr}`); break;
  }

  return entry;
}

// --- Public API ---

export const log = {
  debug: (category: LogCategory, message: string, data?: Record<string, unknown>) =>
    addLog("debug", category, message, data),

  info: (category: LogCategory, message: string, data?: Record<string, unknown>) =>
    addLog("info", category, message, data),

  warn: (category: LogCategory, message: string, data?: Record<string, unknown>) =>
    addLog("warn", category, message, data),

  error: (category: LogCategory, message: string, data?: Record<string, unknown>) =>
    addLog("error", category, message, data),

  /** Start a timed operation. Returns a function you call when done. */
  timer: (category: LogCategory, message: string, data?: Record<string, unknown>) => {
    const start = performance.now();
    const entry = addLog("info", category, `⏱ ${message}`, { ...data, status: "started" });
    return (extraData?: Record<string, unknown>) => {
      const duration = Math.round(performance.now() - start);
      entry.duration = duration;
      entry.data = { ...entry.data, ...extraData, status: "completed", durationMs: duration };
      addLog("info", category, `✓ ${message} (${duration}ms)`, entry.data);
      return duration;
    };
  },

  /** Get all logs, optionally filtered. */
  getLogs: (filters?: {
    level?: LogLevel;
    category?: LogCategory;
    limit?: number;
    since?: string; // ISO timestamp
    jobId?: string;
  }): LogEntry[] => {
    let result = [...logBuffer];

    if (filters?.since) {
      result = result.filter((e) => e.timestamp >= filters.since!);
    }
    if (filters?.level) {
      result = result.filter((e) => e.level === filters.level);
    }
    if (filters?.category) {
      result = result.filter((e) => e.category === filters.category);
    }
    if (filters?.jobId) {
      result = result.filter((e) => e.jobId === filters.jobId);
    }

    result.reverse(); // newest first
    if (filters?.limit) {
      result = result.slice(0, filters.limit);
    }

    return result;
  },

  /** Get log counts by category and level. */
  getStats: () => {
    const counts: Record<string, Record<LogLevel, number>> = {};
    for (const entry of logBuffer) {
      if (!counts[entry.category]) counts[entry.category] = { debug: 0, info: 0, warn: 0, error: 0 };
      counts[entry.category][entry.level]++;
    }
    return {
      total: logBuffer.length,
      byCategory: counts,
    };
  },

  /** Clear all logs. */
  clear: () => {
    logBuffer.length = 0;
  },

  /** Subscribe to new log entries (for real-time UI). */
  subscribe: (listener: LogListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
