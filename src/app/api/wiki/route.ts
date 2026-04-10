import { NextRequest, NextResponse } from "next/server";
import {
  listWikiPages,
  readWikiPage,
  readWikiPageWithBackLinks,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
} from "@/lib/core/wiki-engine";
import type { WikiPageCategory } from "@/types";

/**
 * GET /api/wiki — List all pages, or get a single page by slug.
 * Query params: ?slug=xxx (optional — if provided, returns single page with backlinks)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const category = searchParams.get("category") as WikiPageCategory | null;

    if (slug) {
      const page = await readWikiPageWithBackLinks(slug);
      if (!page) {
        return NextResponse.json({ error: "Page not found" }, { status: 404 });
      }
      return NextResponse.json(page);
    }

    const pages = await listWikiPages(category || undefined);
    return NextResponse.json(pages);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read wiki" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/wiki — Create or update a wiki page.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.slug && body.content !== undefined) {
      // Update existing
      const page = await updateWikiPage(body.slug, {
        content: body.content,
        tags: body.tags,
        sources: body.sources,
        related: body.related,
        appendContent: body.appendContent,
      });
      if (!page) {
        return NextResponse.json({ error: "Page not found" }, { status: 404 });
      }
      return NextResponse.json(page);
    } else if (body.title && body.content) {
      // Create new
      const page = await createWikiPage({
        title: body.title,
        category: body.category || "topics",
        content: body.content,
        tags: body.tags,
        sources: body.sources,
        related: body.related,
      });
      return NextResponse.json(page, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to write wiki page" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/wiki?slug=xxx — Delete a wiki page.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    if (!slug) {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    const deleted = await deleteWikiPage(slug);
    if (!deleted) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete page" },
      { status: 500 }
    );
  }
}
