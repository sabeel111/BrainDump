import { NextRequest, NextResponse } from "next/server";
import { readVaultFile, writeVaultFile, listVaultFiles, getVaultStats } from "@/lib/core/vault";
import { parseAndSaveToVault, isSupportedFile, getFileCategory } from "@/lib/core/document-parser";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = "/tmp/knowledge-wiki-uploads";

/**
 * Get the set of source filenames that have been ingested.
 * Parses the activity log to find ingest entries.
 */
async function getIngestedSourceNames(): Promise<Set<string>> {
  try {
    const content = await readVaultFile("log.md");
    const names = new Set<string>();
    const regex = /## \[\d{4}-\d{2}-\d{2}[^\]]*\]\s+ingest\s*\|\s*(.+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      names.add(match[1].trim());
    }
    return names;
  } catch {
    return new Set();
  }
}

const SUPPORTED_EXTENSIONS_LIST = [
  ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
  ".md", ".txt", ".html", ".json", ".csv",
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp", ".svg",
];

/**
 * GET /api/sources — List all raw sources, or get a single source.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    if (filename) {
      const content = await readVaultFile(`raw/${filename}`);
      return NextResponse.json({ filename, content });
    }

    const files = await listVaultFiles("raw");
    const stats = await getVaultStats();

    // Check which sources have been ingested by reading the log
    const ingestedSources = await getIngestedSourceNames();

    return NextResponse.json({
      files: files.map((f) => ({
        filename: f,
        name: path.basename(f, path.extname(f)),
        extension: path.extname(f).toLowerCase(),
        category: getFileCategory(f),
        ingested: ingestedSources.has(f),
      })),
      total: files.length,
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read sources" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sources — Upload a source file.
 * Handles:
 *   1. FormData (file upload) — PDF, DOCX, images, etc.
 *   2. JSON body (paste text) — { filename, content }
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // --- File upload via FormData ---
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const filename = file.name;

      if (!isSupportedFile(filename)) {
        return NextResponse.json(
          {
            error: `Unsupported file type: ${path.extname(filename)}`,
            supported: SUPPORTED_EXTENSIONS_LIST,
          },
          { status: 400 }
        );
      }

      // Save to temp dir for parsing
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const tempPath = path.join(UPLOAD_DIR, filename);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(tempPath, buffer);

      // Parse the document (LiteParse for PDF/DOCX/etc, plain read for text)
      const { vaultPath, parseResult } = await parseAndSaveToVault(tempPath, filename);

      // Clean up temp file
      await fs.unlink(tempPath).catch(() => {});

      return NextResponse.json({
        filename: path.basename(vaultPath),
        originalFilename: filename,
        filePath: vaultPath,
        format: parseResult.format,
        pageCount: parseResult.pageCount,
        textLength: parseResult.text.length,
        message: `Parsed "${filename}" (${parseResult.format}, ${parseResult.pageCount} page${parseResult.pageCount !== 1 ? "s" : ""})`,
      });
    }

    // --- JSON body (paste text) ---
    const body = await request.json();
    if (!body.filename || !body.content) {
      return NextResponse.json(
        { error: "filename and content are required" },
        { status: 400 }
      );
    }

    const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_");
    const filePath = `raw/${safeName}`;
    await writeVaultFile(filePath, body.content);

    return NextResponse.json({
      filename: safeName,
      filePath,
      message: "Source uploaded successfully",
    });
  } catch (error) {
    console.error("[Sources API] Upload error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to upload source",
        hint: "For PDF/DOCX files, ensure LibreOffice is installed. For images, ensure ImageMagick is installed.",
      },
      { status: 500 }
    );
  }
}
