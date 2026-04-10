import { NextRequest, NextResponse } from "next/server";
import { searchWiki } from "@/lib/search/search";

/**
 * GET /api/search?q=query — Search wiki pages by keyword.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (!query || !query.trim()) {
    return NextResponse.json({ results: [], query: "" });
  }

  const results = await searchWiki(query.trim());
  return NextResponse.json({ results, query });
}
