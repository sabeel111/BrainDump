import { NextRequest, NextResponse } from "next/server";
import { getIngestQueue } from "@/lib/core/ingest-engine";

/**
 * POST /api/ingest — Enqueue source(s) for ingestion.
 * Body: { sourceFile: string, sourceName: string } | { sources: Array<{file, name}> }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const queue = getIngestQueue();

    if (body.sources && Array.isArray(body.sources)) {
      // Batch enqueue
      const ids = await queue.enqueueMany(
        body.sources.map((s: { file: string; name: string }) => ({
          file: s.file,
          name: s.name,
        }))
      );
      return NextResponse.json({ jobIds: ids, message: `${ids.length} sources queued` });
    } else if (body.sourceFile && body.sourceName) {
      // Single enqueue
      const id = await queue.enqueue(body.sourceFile, body.sourceName);
      return NextResponse.json({ jobId: id, message: "Source queued for ingestion" });
    } else {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to enqueue source" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ingest — Get queue status.
 */
export async function GET() {
  const queue = getIngestQueue();
  return NextResponse.json(queue.getStatus());
}
