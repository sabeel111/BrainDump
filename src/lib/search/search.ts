/**
 * File-based search over wiki pages.
 * Simple keyword search — sufficient for small to medium wikis.
 */

import { listWikiPages } from "../core/wiki-engine";
import { readIndex, searchIndex } from "../core/index-manager";
import type { WikiPageSummary } from "@/types";
import { WIKI_CATEGORIES } from "../config/constants";

export interface SearchResult {
  slug: string;
  title: string;
  category: string;
  snippet: string;
  score: number;
}

/**
 * Search wiki pages by query string.
 * Combines index search with content grep for comprehensive results.
 */
export async function searchWiki(query: string, limit = 20): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  // Get all pages
  const allPages = await listWikiPages();

  const results: SearchResult[] = [];

  for (const page of allPages) {
    let score = 0;
    const searchableText = `${page.slug} ${page.title} ${page.content} ${page.frontmatter.tags.join(" ")}`.toLowerCase();

    for (const term of terms) {
      // Slug match (highest relevance)
      if (page.slug.toLowerCase().includes(term)) score += 10;
      // Title match
      if (page.title.toLowerCase().includes(term)) score += 8;
      // Tag match
      if (page.frontmatter.tags.some((t) => t.toLowerCase().includes(term))) score += 5;
      // Content match
      const contentLower = page.content.toLowerCase();
      if (contentLower.includes(term)) {
        // Score by frequency
        const occurrences = contentLower.split(term).length - 1;
        score += Math.min(occurrences * 2, 10);
      }
    }

    if (score > 0) {
      // Extract snippet around first match
      const snippet = extractSnippet(page.content, terms);
      results.push({
        slug: page.slug,
        title: page.title,
        category: page.frontmatter.category,
        snippet,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Extract a text snippet around the first matching term.
 */
function extractSnippet(content: string, terms: string[], maxLen = 200): string {
  const lower = content.toLowerCase();
  let bestPos = -1;

  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (bestPos === -1 || idx < bestPos)) {
      bestPos = idx;
    }
  }

  if (bestPos === -1) {
    return content.substring(0, maxLen).trim() + "...";
  }

  const start = Math.max(0, bestPos - maxLen / 2);
  const end = Math.min(content.length, bestPos + maxLen / 2);
  let snippet = content.substring(start, end).trim();

  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";

  return snippet;
}
