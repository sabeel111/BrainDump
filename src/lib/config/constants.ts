import path from "path";

const VAULT_ROOT = path.join(process.cwd(), "vault");

export const VAULT = {
  root: VAULT_ROOT,
  raw: path.join(VAULT_ROOT, "raw"),
  wiki: path.join(VAULT_ROOT, "wiki"),
  wikiConcepts: path.join(VAULT_ROOT, "wiki", "concepts"),
  wikiEntities: path.join(VAULT_ROOT, "wiki", "entities"),
  wikiSources: path.join(VAULT_ROOT, "wiki", "sources"),
  wikiTopics: path.join(VAULT_ROOT, "wiki", "topics"),
  index: path.join(VAULT_ROOT, "index.md"),
  log: path.join(VAULT_ROOT, "log.md"),
  schema: path.join(VAULT_ROOT, "SCHEMA.md"),
  home: path.join(VAULT_ROOT, "wiki", "home.md"),
  chat: path.join(VAULT_ROOT, "chat"),
} as const;

export const WIKI_CATEGORIES = ["concepts", "entities", "sources", "topics"] as const;

export const INGEST_STEPS = [
  "Reading source",                    // 0
  "Extracting topics & entities",      // 1
  "Finding related wiki pages",        // 2
  "Reading related wiki pages",        // 3
  "Planning wiki pages",               // 4 — was "Analyzing & comparing"
  "Generating page content",           // 5 — per-page generation loop
  "Writing pages to vault",            // 6
  "Updating index",                    // 7
  "Appending log",                     // 8
  "Complete",                          // 9
] as const;

export const DEFAULT_LLM_CONFIG = {
  provider: "openai" as const,
  apiKey: "",
  model: "gpt-4o",
  temperature: 0.3,
  maxTokens: 4096,
};

export const MAX_RETRY_COUNT = 3;
export const RETRY_BASE_DELAY_MS = 2000;

// --- Context window constants for chunking ---
/** Approximate characters per token for English text. */
export const CHARS_PER_TOKEN = 4;
/** Max context tokens we want to use (70% of 200K). */
export const MAX_CONTEXT_TOKENS = 140_000;
/** Corresponding max source characters per chunk. */
export const MAX_SOURCE_CHARS = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN; // ~560K
/** Overlap between chunks in characters. */
export const CHUNK_OVERLAP_CHARS = 2000;
