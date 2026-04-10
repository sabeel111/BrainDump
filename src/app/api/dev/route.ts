import { NextResponse } from "next/server";
import { log } from "@/lib/core/logger";
import { llmInspector } from "@/lib/core/llm-inspector";
import { getIngestQueue } from "@/lib/core/ingest-engine";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section") || "all";
    const limit = parseInt(searchParams.get("limit") || "100");

    const result: Record<string, unknown> = {};

    if (section === "logs" || section === "all") {
      result.logs = log.getLogs({ limit });
    }

    if (section === "llm" || section === "all") {
      result.llm = llmInspector.getCalls({ limit });
    }

    if (section === "queue" || section === "all") {
      result.queue = getIngestQueue().getStatus();
    }

    if (section === "stats" || section === "all") {
      result.stats = log.getStats();
      result.llmStats = llmInspector.getStats();
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load dev tools" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    log.clear();
    llmInspector.clear();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear" },
      { status: 500 }
    );
  }
}
