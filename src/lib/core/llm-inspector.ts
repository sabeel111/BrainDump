/**
 * LLM Call Inspector — tracks every LLM call for debugging.
 * Stores prompts, responses, tokens, timing, and errors.
 */

export interface LLMCallRecord {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  step: string;
  jobId?: string;
  promptMessages: Array<{ role: string; contentPreview: string }>;
  responsePreview: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
  status: "success" | "error";
  error?: string;
}

type CallListener = (record: LLMCallRecord) => void;

const MAX_RECORDS = 500;
const callBuffer: LLMCallRecord[] = [];
const listeners: Set<CallListener> = new Set();
let callCounter = 0;

function truncate(str: string, maxLen: number): string {
  if (!str) return "";
  return str.length > maxLen ? str.substring(0, maxLen) + `... (${str.length} chars total)` : str;
}

export const llmInspector = {
  /**
   * Record a completed LLM call.
   */
  record: (params: {
    provider: string;
    model: string;
    step: string;
    jobId?: string;
    messages: Array<{ role: string; content: string }>;
    response: string;
    tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    durationMs: number;
    error?: string;
  }): LLMCallRecord => {
    const record: LLMCallRecord = {
      id: `llm-${Date.now()}-${++callCounter}`,
      timestamp: new Date().toISOString(),
      provider: params.provider,
      model: params.model,
      step: params.step,
      jobId: params.jobId,
      promptMessages: params.messages.map((m) => ({
        role: m.role,
        contentPreview: truncate(m.content, 300),
      })),
      responsePreview: truncate(params.response, 500),
      tokenUsage: params.tokenUsage,
      durationMs: params.durationMs,
      status: params.error ? "error" : "success",
      error: params.error,
    };

    callBuffer.push(record);
    if (callBuffer.length > MAX_RECORDS) callBuffer.shift();

    for (const listener of listeners) {
      try { listener(record); } catch { /* ignore */ }
    }

    return record;
  },

  /** Get all call records, newest first. */
  getCalls: (filters?: { step?: string; jobId?: string; limit?: number }): LLMCallRecord[] => {
    let result = [...callBuffer].reverse();
    if (filters?.step) result = result.filter((r) => r.step === filters.step);
    if (filters?.jobId) result = result.filter((r) => r.jobId === filters.jobId);
    if (filters?.limit) result = result.slice(0, filters.limit);
    return result;
  },

  /** Get stats about LLM usage. */
  getStats: () => {
    const total = callBuffer.length;
    const errors = callBuffer.filter((r) => r.status === "error").length;
    const totalTokens = callBuffer.reduce(
      (sum, r) => sum + (r.tokenUsage?.totalTokens || 0), 0
    );
    const totalDuration = callBuffer.reduce((sum, r) => sum + r.durationMs, 0);
    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;

    return { total, errors, totalTokens, avgDurationMs: avgDuration };
  },

  /** Clear all records. */
  clear: () => { callBuffer.length = 0; },

  /** Subscribe to new records. */
  subscribe: (listener: CallListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
