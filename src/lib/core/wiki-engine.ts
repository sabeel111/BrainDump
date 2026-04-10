/**
 * Wiki engine — CRUD operations for wiki pages.
 * Orchestrates reading, writing, and managing wiki pages in the vault.
 */

import { readVaultFile, writeVaultFile, deleteVaultFile, listVaultFilesRecursive, vaultFileExists } from "./vault";
import { parseMarkdown, serializeMarkdown, extractWikiLinks, slugify, getWikiPagePath } from "../markdown/parser";
import { upsertIndexEntry, removeIndexEntry } from "./index-manager";
import type { WikiPage, WikiPageCategory, WikiPageCreateInput, WikiPageUpdateInput } from "@/types";
import { WIKI_CATEGORIES } from "../config/constants";

/**
 * Create a new wiki page.
 */
export async function createWikiPage(input: WikiPageCreateInput): Promise<WikiPage> {
  const slug = slugify(input.title);
  const now = new Date().toISOString();
  const category = input.category || "topics";

  const frontmatter = {
    title: input.title,
    category,
    created: now,
    updated: now,
    tags: input.tags || [],
    sourceCount: (input.sources || []).length,
    sources: input.sources || [],
    related: input.related || [],
  };

  const rawContent = serializeMarkdown(frontmatter, input.content);
  const filePath = getWikiPagePath(slug, category);

  await writeVaultFile(filePath, rawContent);

  // Update index with a one-line summary
  const summary = extractSummary(input.content);
  await upsertIndexEntry(slug, category, summary);

  return {
    slug,
    title: input.title,
    category,
    frontmatter,
    content: input.content,
    rawContent,
    wikiLinks: extractWikiLinks(input.content),
    backLinks: [],
    filePath,
  };
}

/**
 * Read a wiki page by slug.
 * Searches all category directories to find the page.
 */
export async function readWikiPage(slug: string): Promise<WikiPage | null> {
  // Search in all category directories
  for (const category of WIKI_CATEGORIES) {
    const filePath = getWikiPagePath(slug, category);

    if (!(await vaultFileExists(filePath))) continue;

    const rawContent = await readVaultFile(filePath);
    const { frontmatter, content } = parseMarkdown(rawContent);

    return {
      slug,
      title: frontmatter.title,
      category: frontmatter.category,
      frontmatter,
      content,
      rawContent,
      wikiLinks: extractWikiLinks(content),
      backLinks: [], // computed separately
      filePath,
    };
  }

  return null;
}

/**
 * Update an existing wiki page.
 */
export async function updateWikiPage(
  slug: string,
  input: WikiPageUpdateInput
): Promise<WikiPage | null> {
  const existing = await readWikiPage(slug);
  if (!existing) return null;

  const now = new Date().toISOString();

  // Merge content
  let newContent = existing.content;
  if (input.content !== undefined) {
    newContent = input.content;
  } else if (input.appendContent) {
    newContent = existing.content + "\n\n" + input.appendContent;
  }

  // Merge frontmatter
  const frontmatter = {
    ...existing.frontmatter,
    updated: now,
    tags: input.tags ? [...new Set([...existing.frontmatter.tags, ...input.tags])] : existing.frontmatter.tags,
    sources: input.sources ? [...new Set([...existing.frontmatter.sources, ...input.sources])] : existing.frontmatter.sources,
    related: input.related ? [...new Set([...existing.frontmatter.related, ...input.related])] : existing.frontmatter.related,
  };
  frontmatter.sourceCount = frontmatter.sources.length;

  const rawContent = serializeMarkdown(frontmatter, newContent);
  await writeVaultFile(existing.filePath, rawContent);

  // Update index summary
  const summary = extractSummary(newContent);
  await upsertIndexEntry(slug, frontmatter.category, summary);

  return {
    ...existing,
    frontmatter,
    content: newContent,
    rawContent,
    wikiLinks: extractWikiLinks(newContent),
  };
}

/**
 * Delete a wiki page.
 */
export async function deleteWikiPage(slug: string): Promise<boolean> {
  const existing = await readWikiPage(slug);
  if (!existing) return false;

  await deleteVaultFile(existing.filePath);
  await removeIndexEntry(slug);
  return true;
}

/**
 * List all wiki pages with summaries.
 */
export async function listWikiPages(category?: WikiPageCategory): Promise<WikiPage[]> {
  const pages: WikiPage[] = [];
  const categories = category ? [category] : WIKI_CATEGORIES;

  for (const cat of categories) {
    const files = await listVaultFilesRecursive(`wiki/${cat}`, ".md");

    for (const file of files) {
      const slug = file.replace(/\.md$/, "");
      const filePath = `wiki/${cat}/${file}`;

      try {
        const rawContent = await readVaultFile(filePath);
        const { frontmatter, content } = parseMarkdown(rawContent);

        pages.push({
          slug,
          title: frontmatter.title,
          category: frontmatter.category,
          frontmatter,
          content,
          rawContent,
          wikiLinks: extractWikiLinks(content),
          backLinks: [],
          filePath,
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  return pages;
}

/**
 * Compute back-links for all pages (which pages link TO a given page).
 */
export async function computeBackLinks(): Promise<Map<string, string[]>> {
  const backLinks = new Map<string, string[]>();
  const allPages = await listWikiPages();

  for (const page of allPages) {
    for (const link of page.wikiLinks) {
      const existing = backLinks.get(link) || [];
      if (!existing.includes(page.slug)) {
        existing.push(page.slug);
      }
      backLinks.set(link, existing);
    }
  }

  return backLinks;
}

/**
 * Get a wiki page with its back-links resolved.
 */
export async function readWikiPageWithBackLinks(slug: string): Promise<WikiPage | null> {
  const page = await readWikiPage(slug);
  if (!page) return null;

  const backLinks = await computeBackLinks();
  page.backLinks = backLinks.get(slug) || [];

  return page;
}

/**
 * Extract a one-line summary from content.
 * Takes the first non-heading, non-empty paragraph.
 */
function extractSummary(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---") && !trimmed.startsWith(">")) {
      // Truncate to ~120 chars
      return trimmed.length > 120 ? trimmed.substring(0, 117) + "..." : trimmed;
    }
  }
  return "No summary available.";
}
