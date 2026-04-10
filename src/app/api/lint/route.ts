import { NextResponse } from "next/server";
import { runLint } from "@/lib/core/lint-engine";

/**
 * POST /api/lint — Run a health check on the wiki.
 */
export async function POST() {
  try {
    const report = await runLint();
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lint failed" },
      { status: 500 }
    );
  }
}
