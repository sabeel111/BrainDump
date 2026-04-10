/**
 * Index manager — reads, updates, and searches the wiki index.
 * The index (index.md) is a structured catalog of all wiki pages.
 */

import { readVaultFile, writeVaultFile } from "./vault";
import type { WikiPageCategory, WikiPageSummary } from "@/types";
import { WIKI_CATEGORIES } from "../config/constants";

const CATEGORY_HEADINGS: Record<WikiPageCategory, string> = {
  concepts: "## Concepts",
  entities: "## Entities",
  sources: "## Sources",
  topics: "## Topics",
};

interface IndexEntry {
  slug: string;
  title: string;
  category: WikiPageCategory;
  summary: string;
  tags: string[];
  filePath: string;
}

/**
 * Read all entries from the index.
 */
export async function readIndex(): Promise<IndexEntry[]> {
  try {
    const content = await readVaultFile("index.md");
    return parseIndexContent(content);
  } catch {
    return [];
  }
}

/**
 * Parse index.md content into structured entries.
 */
function parseIndexContent(content: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  const lines = content.split("\n");
  let currentCategory: WikiPageCategory | null = null;

  for (const line of lines) {
    // Detect category headings
    for (const cat of WIKI_CATEGORIES) {
      if (line.startsWith(CATEGORY_HEADINGS[cat])) {
        currentCategory = cat;
        break;
      }
    }

    // Parse entry lines: - [[slug]] — Summary
    if (currentCategory) {
      const match = line.match(/^-\s+\[\[([^\]]+)\]\]\s*[—\-]\s*(.+)$/);
      if (match) {
        const slug = match[1].trim();
        const summary = match[2].trim();
        entries.push({
          slug,
          title: slugToTitle(slug),
          category: currentCategory,
          summary,
          tags: [],
          filePath: `wiki/${currentCategory}/${slug}.md`,
        });
      }
    }
  }

  return entries;
}

/**
 * Add or update an entry in the index.
 */
export async function upsertIndexEntry(
  slug: string,
  category: WikiPageCategory,
  summary: string
): Promise<void> {
  let content: string;

  try {
    content = await readVaultFile("index.md");
  } catch {
    content = generateEmptyIndex();
  }

  // Remove existing entry for this slug (in any category)
  content = removeEntryFromContent(content, slug);

  // Add entry under the correct category
  const heading = CATEGORY_HEADINGS[category];
  const entryLine = `- [[${slug}]] — ${summary}`;

  content = content.replace(
    heading,
    `${heading}\n${entryLine}`
  );

  // Remove "*(none yet)*" placeholders
  for (const cat of WIKI_CATEGORIES) {
    const placeholder = `*(none yet)*`;
    const headingStr = CATEGORY_HEADINGS[cat];
    if (content.includes(headingStr)) {
      const sectionStart = content.indexOf(headingStr);
      const nextHeading = content.indexOf("\n## ", sectionStart + 1);
      const sectionEnd = nextHeading > -1 ? nextHeading : content.length;
      const section = content.substring(sectionStart, sectionEnd);
      if (section.includes(placeholder) && section.includes(entryLine)) {
        content = content.replace(
          section.substring(0, sectionEnd - sectionStart),
          section.replace(placeholder, "").replace(/\n{3,}/g, "\n\n")
        );
      }
    }
  }

  await writeVaultFile("index.md", content);
}

/**
 * Remove an entry from the index.
 */
export async function removeIndexEntry(slug: string): Promise<void> {
  try {
    let content = await readVaultFile("index.md");
    content = removeEntryFromContent(content, slug);
    await writeVaultFile("index.md", content);
  } catch {
    // index doesn't exist yet
  }
}

/**
 * Remove a specific slug entry from index content.
 */
function removeEntryFromContent(content: string, slug: string): string {
  const regex = new RegExp(`^\\-\\s+\\[\\[${escapeRegex(slug)}\\]\\].*$\\n?`, "gm");
  return content.replace(regex, "");
}

/**
 * Search the index for pages matching a query.
 * Returns matching entries sorted by relevance.
 */
export async function searchIndex(query: string): Promise<IndexEntry[]> {
  const entries = await readIndex();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (terms.length === 0) return entries;

  return entries
    .map((entry) => {
      let score = 0;
      const searchText = `${entry.slug} ${entry.title} ${entry.summary} ${entry.tags.join(" ")}`.toLowerCase();

      for (const term of terms) {
        if (entry.slug.toLowerCase().includes(term)) score += 10;
        if (entry.title.toLowerCase().includes(term)) score += 5;
        if (entry.summary.toLowerCase().includes(term)) score += 3;
        if (entry.tags.some((t) => t.toLowerCase().includes(term))) score += 2;
        if (searchText.includes(term)) score += 1;
      }

      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.entry);
}

/**
 * Get entries for a specific category.
 */
export async function getEntriesByCategory(category: WikiPageCategory): Promise<IndexEntry[]> {
  const entries = await readIndex();
  return entries.filter((e) => e.category === category);
}

/**
 * Find entries whose slug or title matches any of the given topic strings.
 */
export async function findRelatedPages(topics: string[]): Promise<IndexEntry[]> {
  const entries = await readIndex();
  const matches: Map<string, IndexEntry> = new Map();

  for (const topic of topics) {
    const lower = topic.toLowerCase();
    for (const entry of entries) {
      if (
        entry.slug.includes(lower.replace(/\s+/g, "-")) ||
        entry.title.toLowerCase().includes(lower) ||
        entry.summary.toLowerCase().includes(lower)
      ) {
        matches.set(entry.slug, entry);
      }
    }
  }

  return Array.from(matches.values());
}

// Helpers

function generateEmptyIndex(): string {
  return `# Wiki Index

> Auto-generated catalog of all wiki pages. Updated on every ingest.

## Concepts

*(none yet)*

## Entities

*(none yet)*

## Sources

*(none yet)*

## Topics

*(none yet)*
`;
}

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
