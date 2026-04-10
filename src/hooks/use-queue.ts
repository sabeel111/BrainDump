import { useState, useEffect, useCallback, useRef } from "react";
import type { IngestJob, QueueStatus } from "@/types";

export function useQueue(pollInterval = 2000) {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ingest");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silent fail for polling
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(async (jobId: string) => {
    await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", jobId }),
    });
    fetchStatus();
  }, [fetchStatus]);

  const cancel = useCallback(async (jobId: string) => {
    await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", jobId }),
    });
    fetchStatus();
  }, [fetchStatus]);

  const clearHistory = useCallback(async () => {
    await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus, pollInterval]);

  return { status, loading, retry, cancel, clearHistory, refetch: fetchStatus };
}
