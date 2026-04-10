/**
 * Log manager — append and read the activity log.
 */

import { readVaultFile, writeVaultFile } from "./vault";
import type { LogEntry } from "@/types";

/**
 * Append a new entry to the log.
 */
export async function appendLog(
  type: "ingest" | "query" | "lint",
  title: string,
  details: string,
  pagesCreated: string[] = [],
  pagesUpdated: string[] = []
): Promise<void> {
  const timestamp = new Date().toISOString().split("T")[0];
  const time = new Date().toISOString().split("T")[1]?.split(".")[0] || "";

  let content: string;
  try {
    content = await readVaultFile("log.md");
  } catch {
    content = "# Activity Log\n\n> Chronological record of wiki operations.\n\n";
  }

  const entry = [
    "",
    `## [${timestamp} ${time}] ${type} | ${title}`,
    "",
    details,
    "",
    pagesCreated.length > 0 ? `- Pages created: ${pagesCreated.map((p) => `[[${p}]]`).join(", ")}` : "",
    pagesUpdated.length > 0 ? `- Pages updated: ${pagesUpdated.map((p) => `[[${p}]]`).join(", ")}` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  content += entry;
  await writeVaultFile("log.md", content);
}

/**
 * Read the last N entries from the log.
 * Parses the log.md file and returns structured entries.
 */
export async function getRecentLogs(count = 10): Promise<LogEntry[]> {
  try {
    const content = await readVaultFile("log.md");
    return parseLogContent(content, count);
  } catch {
    return [];
  }
}

/**
 * Parse log.md content into structured entries.
 */
function parseLogContent(content: string, limit?: number): LogEntry[] {
  const entries: LogEntry[] = [];
  const regex = /## \[(\d{4}-\d{2}-\d{2})[^\]]*\]\s+(ingest|query|lint)\s*\|\s*(.+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const timestamp = match[1];
    const type = match[2] as "ingest" | "query" | "lint";
    const title = match[3].trim();

    // Extract details between this heading and the next
    const start = match.index + match[0].length;
    const nextHeading = content.indexOf("\n## ", start);
    const section = content.substring(
      start,
      nextHeading > -1 ? nextHeading : content.length
    );

    const createdMatch = section.match(/Pages created:\s*(.+)/);
    const updatedMatch = section.match(/Pages updated:\s*(.+)/);

    entries.push({
      timestamp,
      type,
      title,
      details: section.split("\n").find((l) => l.trim() && !l.startsWith("-"))?.trim() || "",
      pagesCreated: createdMatch
        ? createdMatch[1].replace(/\[\[|\]\]/g, "").split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      pagesUpdated: updatedMatch
        ? updatedMatch[1].replace(/\[\[|\]\]/g, "").split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    });
  }

  // Return most recent first
  entries.reverse();
  return limit ? entries.slice(0, limit) : entries;
}
