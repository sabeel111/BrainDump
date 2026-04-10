/**
 * Page Content Pipeline — enterprise-grade LLM output processing.
 *
 * Multi-stage pipeline that transforms raw LLM JSON into validated,
 * sanitized wiki pages ready for disk. Every stage is a pure function
 * with clear contracts and error recovery.
 *
 * Pipeline stages:
 *   1. PARSE    — Extract JSON from LLM response text
 *   2. VALIDATE — Schema-check with Zod (type-safe runtime guarantees)
 *   3. STRIP    — Remove any frontmatter the LLM injected into content
 *   4. NORMALIZE — Fix wiki-links, tags, category, slug
 *   5. VERIFY   — Check isNew against actual vault state
 *   6. BUILD    — Construct frontmatter (system-controlled, never LLM)
 *   7. WRITE    — Persist to vault
 *
 * Design principles:
 *   - Frontmatter is ALWAYS built by the system, never by the LLM
 *   - Every transformation is a pure, testable function
 *   - Partial success: one bad page doesn't kill the whole batch
 *   - Every stage logs what it changed for debugging
 */

import { z } from "zod";
import matter from "gray-matter";
import {
  parseMarkdown,
  serializeMarkdown,
  extractWikiLinks,
  slugify,
  getWikiPagePath,
} from "../markdown/parser";
import { writeVaultFile } from "./vault";
import { upsertIndexEntry } from "./index-manager";
import { createWikiPage, updateWikiPage, readWikiPage } from "./wiki-engine";
import { log } from "./logger";
import type { WikiPageCategory, WikiPageFrontmatter } from "@/types";
import type { PageGeneration, PagePlanEntry } from "@/types/llm";

// ============================================================
// SCHEMAS — Zod validators for LLM output
// ============================================================

const VALID_CATEGORIES = ["concepts", "entities", "sources", "topics"] as const;

const PageGenerationSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1).max(200),
  category: z.string().transform((val) => {
    const normalized = val.toLowerCase().trim();
    if ((VALID_CATEGORIES as readonly string[]).includes(normalized)) {
      return normalized as WikiPageCategory;
    }
    return "topics" as WikiPageCategory;
  }),
  content: z.string().min(30, "Content must be at least 30 characters"),
  tags: z.array(z.string()).default([]),
  isNew: z.boolean().default(true),
});

export type ValidatedPageGeneration = z.infer<typeof PageGenerationSchema>;

/** Result of processing a single page through the pipeline. */
export interface ProcessedPage {
  slug: string;
  title: string;
  category: WikiPageCategory;
  content: string;          // sanitized markdown body (no frontmatter)
  tags: string[];
  isNew: boolean;
  wikiLinks: string[];      // extracted from sanitized content
  warnings: string[];       // non-fatal issues encountered
}

/** Outcome of writing a processed page. */
export interface PageWriteResult {
  slug: string;
  action: "created" | "updated" | "skipped";
  warnings: string[];
  error?: string;
}

// ============================================================
// STAGE 1: PARSE — Already handled by extractAndParseJson
// (That function lives in ingest-engine.ts)
// ============================================================

// ============================================================
// STAGE 2: VALIDATE — Zod schema validation
// ============================================================

/**
 * Validate raw parsed JSON against the PageGeneration schema.
 * Returns a validated object or null with error details.
 */
export function validatePageGeneration(
  raw: Record<string, unknown>,
  fallbackSlug: string
): { data: ValidatedPageGeneration | null; errors: string[] } {
  const errors: string[] = [];

  // Pre-validation: ensure content exists and is long enough
  if (!raw.content || typeof raw.content !== "string" || raw.content.trim().length < 30) {
    return {
      data: null,
      errors: [`Content too short (${typeof raw.content === "string" ? raw.content.length : 0} chars)`],
    };
  }

  const result = PageGenerationSchema.safeParse({
    ...raw,
    slug: raw.slug || fallbackSlug,
  });

  if (result.success) {
    return { data: result.data, errors: [] };
  }

  const zodErrors = result.error.issues.map(
    (iss) => `${iss.path.join(".")}: ${iss.message}`
  );
  return { data: null, errors: zodErrors };
}

// ============================================================
// STAGE 3: STRIP — Remove frontmatter from LLM content
// ============================================================

/**
 * Strip any YAML frontmatter from content that the LLM may have included.
 * The LLM sometimes wraps its content in --- blocks, which must be removed
 * because frontmatter is system-controlled.
 *
 * Handles multiple patterns:
 *   - Standard --- delimited frontmatter
 *   - Frontmatter with trailing --- and extra whitespace
 *   - Multiple frontmatter blocks (keeps only the body)
 */
export function stripFrontmatter(content: string): string {
  if (!content) return content;

  // Don't touch content that doesn't start with ---
  if (!content.trimStart().startsWith("---")) return content;

  // Use gray-matter to safely extract the body
  try {
    const parsed = matter(content);
    if (parsed.content) return parsed.content.trim();
  } catch {
    // gray-matter failed (e.g., [[ in YAML) — manual strip
  }

  // Manual fallback: find the second --- and take everything after it
  const lines = content.split("\n");
  let dashCount = 0;
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      dashCount++;
      if (dashCount === 2) {
        bodyStart = i + 1;
        break;
      }
    }
  }

  if (bodyStart > 0) {
    return lines.slice(bodyStart).join("\n").trim();
  }

  // Couldn't strip — return as-is but strip the opening ---
  return content.replace(/^---\s*\n?/, "").trim();
}

// ============================================================
// STAGE 4: NORMALIZE — Fix wiki-links, tags, slug, category
// ============================================================

/**
 * Normalize all fields of a page generation.
 * Returns a clean ProcessedPage ready for vault writing.
 */
export function normalizePage(
  page: ValidatedPageGeneration,
  plannedSlug: string,
  sourceName: string,
): ProcessedPage {
  const warnings: string[] = [];

  // 4a. Compute canonical slug from title
  const canonicalSlug = slugify(page.title);
  if (page.slug !== canonicalSlug) {
    warnings.push(`Slug normalized: "${page.slug}" → "${canonicalSlug}"`);
    page.slug = canonicalSlug;
  }

  // If the planned slug differs, prefer canonical
  if (canonicalSlug !== plannedSlug) {
    warnings.push(`Slug differs from plan: planned "${plannedSlug}", got "${canonicalSlug}"`);
  }

  // 4b. Strip frontmatter from content
  const rawContent = page.content;
  const strippedContent = stripFrontmatter(rawContent);
  if (strippedContent !== rawContent) {
    warnings.push("Stripped frontmatter from LLM-generated content");
  }

  // 4c. Normalize tags — lowercase, trim, deduplicate, remove special chars
  const normalizedTags = [...new Set(
    page.tags
      .map((t) => t.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-"))
      .filter((t) => t.length > 0)
  )];

  // 4d. Normalize wiki-links in content — ensure they use proper slug format
  const normalizedContent = normalizeWikiLinks(strippedContent);

  // 4e. Extract wiki-links from normalized content
  const wikiLinks = extractWikiLinks(normalizedContent);

  return {
    slug: canonicalSlug,
    title: page.title.trim(),
    category: page.category,
    content: normalizedContent,
    tags: normalizedTags,
    isNew: page.isNew,
    wikiLinks,
    warnings,
  };
}

/**
 * Normalize [[wiki-links]] in markdown content to use proper slugs.
 * Converts [[Foo Bar]] → [[foo-bar]] and [[Foo|Display Text]] → [[foo-bar|Display Text]]
 */
export function normalizeWikiLinks(content: string): string {
  return content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, label?: string) => {
      const normalizedTarget = slugify(target.trim());
      // If the slug didn't change, return as-is to preserve display text
      if (normalizedTarget === target.trim()) {
        return _match;
      }
      // Return with slugified target
      return label ? `[[${normalizedTarget}|${label}]]` : `[[${normalizedTarget}]]`;
    }
  );
}

// ============================================================
// STAGE 5: VERIFY — Check isNew against actual vault state
// ============================================================

/**
 * Verify whether a page marked as "new" actually exists in the vault.
 * Corrects the isNew flag if the LLM got it wrong.
 */
export async function verifyPageState(
  page: ProcessedPage
): Promise<ProcessedPage> {
  const existing = await readWikiPage(page.slug);

  if (page.isNew && existing) {
    page.isNew = false;
    page.warnings.push(`Page marked as new but already exists — will update instead`);
  } else if (!page.isNew && !existing) {
    page.isNew = true;
    page.warnings.push(`Page marked as existing but not found in vault — will create instead`);
  }

  return page;
}

// ============================================================
// STAGE 6: BUILD — Construct system-controlled frontmatter
// ============================================================

/**
 * Build frontmatter for a new page. The system controls all metadata.
 * The LLM never generates frontmatter — only title, content, category, tags.
 */
export function buildFrontmatter(
  page: ProcessedPage,
  sourceName: string,
): WikiPageFrontmatter {
  const now = new Date().toISOString();
  return {
    title: page.title,
    category: page.category,
    created: now,
    updated: now,
    tags: page.tags,
    sourceCount: 1,
    sources: [sourceName],
    related: page.wikiLinks,
  };
}

/**
 * Merge frontmatter for an existing page being updated.
 */
export function mergeFrontmatter(
  existing: WikiPageFrontmatter,
  page: ProcessedPage,
  sourceName: string,
): WikiPageFrontmatter {
  return {
    ...existing,
    updated: new Date().toISOString(),
    tags: [...new Set([...existing.tags, ...page.tags])],
    sources: [...new Set([...existing.sources, sourceName])],
    related: [...new Set([...existing.related, ...page.wikiLinks])],
    sourceCount: [...new Set([...existing.sources, sourceName])].length,
  };
}

// ============================================================
// STAGE 7: WRITE — Persist to vault with proper frontmatter
// ============================================================

/**
 * Write a processed page to the vault.
 * Handles both new page creation and existing page updates.
 */
export async function writePage(
  page: ProcessedPage,
  sourceName: string,
): Promise<PageWriteResult> {
  const warnings = [...page.warnings];

  try {
    if (page.isNew) {
      // Build frontmatter and write directly — bypass createWikiPage
      // which would try to parse LLM content as frontmatter
      const frontmatter = buildFrontmatter(page, sourceName);
      const rawContent = serializeMarkdown(frontmatter, page.content);
      const filePath = getWikiPagePath(page.slug, page.category);

      await writeVaultFile(filePath, rawContent);

      // Update search index
      const summary = extractSummary(page.content);
      await upsertIndexEntry(page.slug, page.category, summary);

      log.info("pipeline", `Created page: ${page.slug}`, {
        category: page.category, tags: page.tags.length, links: page.wikiLinks.length,
      });

      return { slug: page.slug, action: "created", warnings };
    } else {
      // Update existing page
      const existing = await readWikiPage(page.slug);
      if (!existing) {
        // Race condition — page was deleted. Create instead.
        warnings.push("Page disappeared during processing — creating new");
        const frontmatter = buildFrontmatter(page, sourceName);
        const rawContent = serializeMarkdown(frontmatter, page.content);
        const filePath = getWikiPagePath(page.slug, page.category);
        await writeVaultFile(filePath, rawContent);

        const summary = extractSummary(page.content);
        await upsertIndexEntry(page.slug, page.category, summary);

        return { slug: page.slug, action: "created", warnings };
      }

      // Merge frontmatter and append content
      const mergedFm = mergeFrontmatter(existing.frontmatter, page, sourceName);
      const newContent = existing.content +
        `\n\n---\n**Updated from ${sourceName}:**\n\n${page.content}`;
      const rawContent = serializeMarkdown(mergedFm, newContent);

      await writeVaultFile(existing.filePath, rawContent);

      const summary = extractSummary(newContent);
      await upsertIndexEntry(page.slug, mergedFm.category, summary);

      log.info("pipeline", `Updated page: ${page.slug}`, {
        tagsAdded: page.tags.length, linksAdded: page.wikiLinks.length,
      });

      return { slug: page.slug, action: "updated", warnings };
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error("pipeline", `Failed to write page: ${page.slug}`, { error: errMsg });
    return { slug: page.slug, action: "skipped", warnings, error: errMsg };
  }
}

// ============================================================
// FULL PIPELINE — Orchestrate all stages
// ============================================================

/**
 * Process a raw markdown LLM response into a written wiki page.
 * This is the new primary entry point for page generation.
 *
 * The LLM returns raw markdown — no JSON parsing needed.
 * All metadata (slug, title, category, tags, isNew) comes from the plan.
 */
export async function processRawMarkdownPage(
  rawMarkdown: string,
  plannedPage: PagePlanEntry,
  sourceName: string,
  jobId: string,
): Promise<PageWriteResult> {
  // Stage 3: Strip frontmatter (LLM may still add it despite instructions)
  let content = stripFrontmatter(rawMarkdown);

  // Basic content check
  if (!content || content.trim().length < 30) {
    log.warn("pipeline", `Content too short for "${plannedPage.slug}"`, {
      jobId, charCount: content?.length || 0,
    });
    return {
      slug: plannedPage.slug,
      action: "skipped",
      warnings: [`Content too short (${content?.length || 0} chars)`],
      error: "Content below minimum length",
    };
  }

  // Strip code fences if the LLM wrapped the content in them
  content = stripCodeFences(content);

  // Stage 4: Normalize wiki-links and build processed page from plan metadata
  const normalizedContent = normalizeWikiLinks(content);
  const wikiLinks = extractWikiLinks(normalizedContent);
  const normalizedTags = [...new Set(
    plannedPage.tags
      .map((t) => t.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-"))
      .filter((t) => t.length > 0)
  )];

  const page: ProcessedPage = {
    slug: plannedPage.slug,
    title: plannedPage.title.trim(),
    category: plannedPage.category,
    content: normalizedContent,
    tags: normalizedTags,
    isNew: plannedPage.isNew,
    wikiLinks,
    warnings: [],
  };

  if (content !== rawMarkdown) {
    page.warnings.push("Stripped frontmatter/code fences from LLM response");
  }

  // Stage 5: Verify isNew against actual vault state
  await verifyPageState(page);

  // Stage 7: Write (stage 6 is embedded inside)
  const result = await writePage(page, sourceName);

  if (result.warnings.length > 0) {
    log.debug("pipeline", `Write result for "${page.slug}"`, { action: result.action, warnings: result.warnings });
  }

  return result;
}

/**
 * Legacy entry point — processes LLM JSON output.
 * Kept for backward compatibility but the primary flow now uses processRawMarkdownPage.
 */
export async function processAndWritePage(
  rawJson: Record<string, unknown>,
  plannedPage: PagePlanEntry,
  sourceName: string,
  jobId: string,
): Promise<PageWriteResult> {
  // Stage 2: Validate
  const { data, errors } = validatePageGeneration(rawJson, plannedPage.slug);
  if (!data) {
    log.warn("pipeline", `Validation failed for "${plannedPage.slug}"`, { jobId, errors });
    return {
      slug: plannedPage.slug,
      action: "skipped",
      warnings: errors,
      error: `Schema validation failed: ${errors.join("; ")}`,
    };
  }

  // Stage 4: Normalize
  const page = normalizePage(data, plannedPage.slug, sourceName);

  if (page.warnings.length > 0) {
    log.debug("pipeline", `Normalization warnings for "${page.slug}"`, { jobId, warnings: page.warnings });
  }

  // Stage 5: Verify isNew
  await verifyPageState(page);

  // Stage 7: Write (stage 6 is embedded inside)
  const result = await writePage(page, sourceName);

  if (result.warnings.length > 0) {
    log.debug("pipeline", `Write result for "${page.slug}"`, { action: result.action, warnings: result.warnings });
  }

  return result;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Strip wrapping code fences from LLM output.
 * Sometimes the LLM wraps its markdown in ```markdown ... ``` despite instructions.
 */
function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  // Check if the entire content is wrapped in a code fence
  const fenceMatch = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return content;
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
      return trimmed.length > 120 ? trimmed.substring(0, 117) + "..." : trimmed;
    }
  }
  return "No summary available.";
}
