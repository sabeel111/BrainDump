/**
 * Vault filesystem operations.
 * Handles initialization, reading, and writing of the vault structure.
 * Pure Node.js — no Next.js dependencies.
 */

import fs from "fs/promises";
import path from "path";
import { VAULT, WIKI_CATEGORIES } from "../config/constants";

/**
 * Initialize the vault directory structure and default files.
 * Safe to call multiple times — skips existing files/dirs.
 */
export async function initializeVault(): Promise<void> {
  // Create directories
  const dirs = [
    VAULT.raw,
    VAULT.wiki,
    VAULT.wikiConcepts,
    VAULT.wikiEntities,
    VAULT.wikiSources,
    VAULT.wikiTopics,
    VAULT.chat,
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }

  // Create default files if they don't exist
  const defaults: Array<{ path: string; content: string }> = [
    {
      path: VAULT.home,
      content: `---
title: Home
category: topics
created: "${new Date().toISOString()}"
updated: "${new Date().toISOString()}"
tags: ["home"]
sourceCount: 0
sources: []
related: []
---

# Knowledge Wiki

Welcome to your personal knowledge base. This wiki is maintained by your LLM assistant.

## Topics

*No topics yet. Start by ingesting a source!*

## Quick Stats

- **Total pages:** 0
- **Total sources:** 0
`,
    },
    {
      path: VAULT.index,
      content: `# Wiki Index

> Auto-generated catalog of all wiki pages. Updated on every ingest.

## Concepts

*(none yet)*

## Entities

*(none yet)*

## Sources

*(none yet)*

## Topics

*(none yet)*
`,
    },
    {
      path: VAULT.log,
      content: `# Activity Log

> Chronological record of wiki operations.

`,
    },
    {
      path: VAULT.schema,
      content: `# Wiki Schema & Conventions

This document defines how the LLM should structure and maintain the wiki.

## Page Types

- **concepts/** — Abstract ideas, theories, frameworks (e.g., "circadian-rhythm")
- **entities/** — People, organizations, specific things (e.g., "matthew-walker")
- **sources/** — Summaries of ingested source documents (e.g., "why-sleep-matters")
- **topics/** — Broad topic overviews that tie concepts/entities together (e.g., "sleep")

## Page Format

Every page MUST have YAML frontmatter:

\\\`\\\`\\\`yaml
---
title: Page Title
category: concepts | entities | sources | topics
created: ISO-date
updated: ISO-date
tags: [tag1, tag2]
sourceCount: N
sources: [source-file.md]
related: [[other-page]]
---
\\\`\\\`\\\`

## Cross-References

- Use \\"[[wiki-links]]\\" to reference other pages
- Every page should link to at least 2-3 related pages when possible
- Source summaries should link to all concepts/entities mentioned

## Ingest Rules

1. Read the source document in full
2. Extract key topics, entities, and concepts
3. Check index.md for existing related pages
4. Read existing related pages before writing
5. Compare new info against existing — flag contradictions
6. Create new pages for new concepts/entities
7. Update existing pages with new information
8. Always update index.md and log.md

## Contradiction Handling

When a new source contradicts existing wiki content:
- Keep both claims with attribution
- Add a blockquote with ⚠️ marker
- Note the conflict and which source says what
- Suggest confidence level: "contested" / "likely" / "confirmed"

## Quality Standards

- Pages should be substantive (not stubs)
- Every concept page should have: definition, key aspects, related concepts, sources
- Every entity page should have: who/what, relevance, key contributions, related topics
- Source summaries should capture: main thesis, key findings, methodology (if applicable)
`,
    },
  ];

  for (const file of defaults) {
    try {
      await fs.access(file.path);
    } catch {
      await fs.writeFile(file.path, file.content, "utf-8");
    }
  }
}

/**
 * Check if the vault is initialized.
 */
export async function isVaultInitialized(): Promise<boolean> {
  try {
    await fs.access(VAULT.index);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file from the vault.
 */
export async function readVaultFile(relativePath: string): Promise<string> {
  const fullPath = path.join(VAULT.root, relativePath);
  return fs.readFile(fullPath, "utf-8");
}

/**
 * Write a file to the vault.
 */
export async function writeVaultFile(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(VAULT.root, relativePath);
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

/**
 * Delete a file from the vault.
 */
export async function deleteVaultFile(relativePath: string): Promise<void> {
  const fullPath = path.join(VAULT.root, relativePath);
  await fs.unlink(fullPath);
}

/**
 * List files in a vault directory.
 */
export async function listVaultFiles(relativePath: string, extension?: string): Promise<string[]> {
  const fullPath = path.join(VAULT.root, relativePath);
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => !extension || name.endsWith(extension));
  } catch {
    return [];
  }
}

/**
 * List all markdown files recursively in a directory.
 */
export async function listVaultFilesRecursive(
  relativePath: string,
  extension = ".md"
): Promise<string[]> {
  const fullPath = path.join(VAULT.root, relativePath);
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(extension)) {
        results.push(path.relative(path.join(VAULT.root, relativePath), full));
      }
    }
  }

  try {
    await walk(fullPath);
  } catch {
    // directory doesn't exist
  }

  return results;
}

/**
 * Check if a file exists in the vault.
 */
export async function vaultFileExists(relativePath: string): Promise<boolean> {
  const fullPath = path.join(VAULT.root, relativePath);
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get stats about the vault.
 */
export async function getVaultStats(): Promise<{
  totalPages: number;
  totalSources: number;
  categories: Record<string, number>;
}> {
  const categories: Record<string, number> = {};

  for (const cat of WIKI_CATEGORIES) {
    const files = await listVaultFiles(`wiki/${cat}`, ".md");
    categories[cat] = files.length;
  }

  const sources = await listVaultFiles("raw");

  return {
    totalPages: Object.values(categories).reduce((a, b) => a + b, 0),
    totalSources: sources.length,
    categories,
  };
}
