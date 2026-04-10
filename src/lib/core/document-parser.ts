/**
 * Document parser using LiteParse CLI (`lit parse`).
 * Handles PDF, DOCX, PPTX, XLSX, images, and more.
 * Converts any supported format to text for wiki ingestion.
 *
 * Uses the CLI (`lit parse`) instead of the Node.js API because:
 * - The CLI handles native dependencies internally
 * - No dynamic import issues with Next.js bundling
 * - More reliable across environments
 */

import path from "path";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeVaultFile } from "./vault";
import { log } from "./logger";

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".docm", ".odt", ".rtf",
  ".ppt", ".pptx", ".pptm", ".odp",
  ".xls", ".xlsx", ".xlsm", ".ods", ".csv", ".tsv",
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp", ".svg",
  ".md", ".txt", ".markdown", ".html", ".htm", ".json", ".xml",
]);

const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".markdown", ".html", ".htm", ".json", ".xml",
]);

// Binary formats that should NEVER be read as raw text
const BINARY_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".docm", ".odt", ".rtf",
  ".ppt", ".pptx", ".pptm", ".odp",
  ".xls", ".xlsx", ".xlsm", ".ods",
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp", ".svg",
]);

export interface ParseResult {
  text: string;
  pageCount: number;
  format: string;
  originalFilename: string;
}

/**
 * Check if a file extension is supported.
 */
export function isSupportedFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * Get the category of a file based on its extension.
 */
export function getFileCategory(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "PDF";
  if ([".doc", ".docx", ".docm", ".odt", ".rtf"].includes(ext)) return "Word";
  if ([".ppt", ".pptx", ".pptm", ".odp"].includes(ext)) return "Slides";
  if ([".xls", ".xlsx", ".xlsm", ".ods", ".csv", ".tsv"].includes(ext)) return "Spreadsheet";
  if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp", ".svg"].includes(ext)) return "Image";
  if ([".md", ".txt", ".markdown"].includes(ext)) return "Text";
  if ([".html", ".htm"].includes(ext)) return "HTML";
  return "Document";
}

/**
 * Check if LiteParse CLI is available.
 */
async function isLiteParseAvailable(): Promise<boolean> {
  try {
    await execFileAsync("lit", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a binary document using LiteParse CLI.
 * Returns extracted text content.
 */
async function parseWithLiteParse(filePath: string, filename: string): Promise<ParseResult> {
  const ext = path.extname(filename).toLowerCase();

  // Try JSON format first for page count info
  try {
    const { stdout } = await execFileAsync("lit", [
      "parse", filePath,
      "--format", "json",
      "--no-ocr", // faster for text-based PDFs
    ], { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 });

    const jsonResult = JSON.parse(stdout);
    const text = jsonResult.text || jsonResult.content || "";
    const pageCount = jsonResult.pages?.length || jsonResult.pageCount || 1;

    if (text.length > 100) {
      log.info("parse", `LiteParse (json) extracted ${text.length} chars from ${filename}`, {
        format: ext, pageCount, chars: text.length,
      });
      return {
        text,
        pageCount,
        format: ext.replace(".", ""),
        originalFilename: filename,
      };
    }
  } catch (err) {
    log.debug("parse", `LiteParse JSON parse failed, trying text format`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback to plain text format
  try {
    const { stdout } = await execFileAsync("lit", [
      "parse", filePath,
      "--format", "text",
      "--no-ocr",
    ], { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 });

    if (stdout && stdout.length > 100) {
      log.info("parse", `LiteParse (text) extracted ${stdout.length} chars from ${filename}`, {
        format: ext, chars: stdout.length,
      });
      return {
        text: stdout,
        pageCount: 1,
        format: ext.replace(".", ""),
        originalFilename: filename,
      };
    }
  } catch (err) {
    log.warn("parse", `LiteParse text parse also failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Last resort: try with OCR enabled (for scanned documents / images)
  try {
    const { stdout } = await execFileAsync("lit", [
      "parse", filePath,
      "--format", "text",
    ], { timeout: 180_000, maxBuffer: 50 * 1024 * 1024 });

    if (stdout && stdout.length > 50) {
      log.info("parse", `LiteParse (ocr) extracted ${stdout.length} chars from ${filename}`, {
        format: ext, chars: stdout.length,
      });
      return {
        text: stdout,
        pageCount: 1,
        format: ext.replace(".", ""),
        originalFilename: filename,
      };
    }
  } catch (err) {
    log.error("parse", `LiteParse failed completely for ${filename}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  throw new Error(
    `LiteParse could not extract text from "${filename}". ` +
    `The file may be corrupted, password-protected, or contain only images without OCR support.`
  );
}

/**
 * Parse a document file and extract its text content.
 */
export async function parseDocument(filePath: string, filename: string): Promise<ParseResult> {
  const ext = path.extname(filename).toLowerCase();

  // Plain text files — read directly
  if (TEXT_EXTENSIONS.has(ext)) {
    const content = await fs.readFile(filePath, "utf-8");
    return {
      text: content,
      pageCount: 1,
      format: "text",
      originalFilename: filename,
    };
  }

  // Binary formats — MUST use LiteParse, never read raw bytes as text
  if (BINARY_EXTENSIONS.has(ext)) {
    const available = await isLiteParseAvailable();
    if (!available) {
      throw new Error(
        `Cannot parse "${filename}" — LiteParse CLI is not installed. ` +
        `Install it with: npm i -g @llamaindex/liteparse`
      );
    }

    return parseWithLiteParse(filePath, filename);
  }

  // Unknown format — try text read, but validate it's not binary
  const content = await fs.readFile(filePath, "utf-8");
  const nullCount = (content.substring(0, 1000).match(/\0/g) || []).length;
  if (nullCount > 10) {
    throw new Error(
      `"${filename}" appears to be a binary file. ` +
      `Supported binary formats: PDF, DOCX, PPTX, XLSX, images. ` +
      `Install LiteParse for support: npm i -g @llamaindex/liteparse`
    );
  }

  return {
    text: content,
    pageCount: 1,
    format: "text",
    originalFilename: filename,
  };
}

/**
 * Parse a file and save the extracted text as a markdown source in the vault.
 * Returns the vault-relative path of the saved source.
 */
export async function parseAndSaveToVault(
  filePath: string,
  filename: string
): Promise<{ vaultPath: string; parseResult: ParseResult }> {
  const result = await parseDocument(filePath, filename);

  const baseName = path.basename(filename, path.extname(filename));
  const mdFilename = `${baseName}.md`;
  const vaultPath = `raw/${mdFilename}`;

  const content = [
    `---`,
    `original_file: "${filename}"`,
    `format: "${result.format}"`,
    `page_count: ${result.pageCount}`,
    `parsed_at: "${new Date().toISOString()}"`,
    `char_count: ${result.text.length}`,
    `---`,
    ``,
    `# ${baseName}`,
    ``,
    `> Source: ${filename} (${result.format}, ${result.pageCount} page${result.pageCount !== 1 ? "s" : ""}, ${result.text.length.toLocaleString()} chars)`,
    ``,
    result.text,
  ].join("\n");

  await writeVaultFile(vaultPath, content);

  return { vaultPath, parseResult: result };
}
