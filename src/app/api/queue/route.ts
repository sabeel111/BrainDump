import { NextRequest, NextResponse } from "next/server";
import { getIngestQueue } from "@/lib/core/ingest-engine";

/**
 * GET /api/queue — Get current ingestion queue status (SSE stream).
 * Keeps the connection open and sends updates as they happen.
 */
export async function GET() {
  const queue = getIngestQueue();
  const status = queue.getStatus();

  // For now, return a snapshot. Real-time SSE can be added later.
  return NextResponse.json(status);
}

/**
 * POST /api/queue — Queue management actions.
 * Body: { action: "retry" | "cancel" | "clear", jobId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { action, jobId } = await request.json();
    const queue = getIngestQueue();

    switch (action) {
      case "retry":
        if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
        await queue.retry(jobId);
        return NextResponse.json({ success: true });
      case "cancel":
        if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
        queue.cancel(jobId);
        return NextResponse.json({ success: true });
      case "clear":
        queue.clearHistory();
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 }
    );
  }
}
