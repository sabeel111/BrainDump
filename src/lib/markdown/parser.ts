/**
 * Markdown parsing utilities.
 * Extract frontmatter, wiki-links, and content from markdown files.
 * Pure Node.js — no framework dependencies.
 */

import matter from "gray-matter";
import type { WikiPageFrontmatter, WikiPageCategory } from "@/types";

/**
 * Parse a markdown file with YAML frontmatter.
 */
export function parseMarkdown(rawContent: string): {
  frontmatter: WikiPageFrontmatter;
  content: string;
} {
  const parsed = matter(rawContent);

  const frontmatter: WikiPageFrontmatter = {
    title: parsed.data.title || "Untitled",
    category: parsed.data.category || "topics",
    created: parsed.data.created || new Date().toISOString(),
    updated: parsed.data.updated || new Date().toISOString(),
    tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
    sourceCount: parsed.data.sourceCount || 0,
    sources: Array.isArray(parsed.data.sources) ? parsed.data.sources : [],
    related: Array.isArray(parsed.data.related) ? parsed.data.related : [],
  };

  return {
    frontmatter,
    content: parsed.content.trim(),
  };
}

/**
 * Serialize frontmatter and content back to a full markdown string.
 */
export function serializeMarkdown(frontmatter: WikiPageFrontmatter, content: string): string {
  const fm: Record<string, unknown> = {
    title: frontmatter.title,
    category: frontmatter.category,
    created: frontmatter.created,
    updated: frontmatter.updated,
    tags: frontmatter.tags,
    sourceCount: frontmatter.sourceCount,
    sources: frontmatter.sources,
    related: frontmatter.related,
  };

  return matter.stringify(content, fm);
}

/**
 * Extract all [[wiki-links]] from markdown content.
 * Returns an array of unique link targets (lowercased, slugified).
 */
export function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: Set<string> = new Set();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    links.add(slugify(match[1].trim()));
  }

  return Array.from(links);
}

/**
 * Convert a title to a URL/filesystem-safe slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Get the category directory for a wiki page category.
 */
export function getCategoryDir(category: WikiPageCategory): string {
  switch (category) {
    case "concepts":
      return "wiki/concepts";
    case "entities":
      return "wiki/entities";
    case "sources":
      return "wiki/sources";
    case "topics":
      return "wiki/topics";
    default:
      return "wiki/topics";
  }
}

/**
 * Get the file path for a wiki page.
 */
export function getWikiPagePath(slug: string, category: WikiPageCategory): string {
  return `${getCategoryDir(category)}/${slug}.md`;
}

/**
 * Find wiki-links in content and replace them with HTML anchor tags.
 * Used for rendering in the wiki viewer.
 */
export function renderWikiLinksToHtml(content: string): string {
  return content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target, label) => {
      const slug = slugify(target.trim());
      const displayText = label || target.trim();
      return `<a href="/wiki/${slug}" class="wiki-link" data-slug="${slug}">${displayText}</a>`;
    }
  );
}
