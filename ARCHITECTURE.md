# Architecture & Design Decisions

> Technical documentation for developers working on the Knowledge Wiki codebase.
> Records the *why* behind key decisions, not just the *what*.

---

## Table of Contents

1. [Ingest Pipeline Architecture](#1-ingest-pipeline-architecture)
2. [LLM Response Parsing](#2-llm-response-parsing)
3. [Sequential Job Queue](#3-sequential-job-queue)
4. [Provider-Agnostic LLM Layer](#4-provider-agnostic-llm-layer)
5. [Vault Filesystem Design](#5-vault-filesystem-design)
6. [Developer Observability](#6-developer-observability)
7. [Design System — The Editorial Wiki](#7-design-system--the-editorial-wiki)
8. [Prompt Engineering Strategy](#8-prompt-engineering-strategy)
9. [Key Configuration & Constants](#9-key-configuration--constants)

---

## 1. Ingest Pipeline Architecture

### Strategy: "Plan Once, Generate Per-Page"

The ingest pipeline uses a **two-phase architecture** that separates comprehension from generation:

```
┌─────────────────────────────────────────────────┐
│ PHASE 1: FULL-CONTEXT COMPREHENSION             │
│                                                 │
│  Source document (up to ~560K chars)             │
│         ↓                                       │
│  Step 1: Extract topics — FULL source sent       │
│         ↓                                       │
│  Step 4: Plan pages — FULL source sent           │
│          Returns: [                              │
│            {slug, title, category, scope, ...},  │
│            ...                                   │
│          ]                                       │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ PHASE 2: FOCUSED PER-PAGE GENERATION            │
│                                                 │
│  For each planned page:                          │
│    → LLM gets: full source + page plan +         │
│      sibling pages list + existing content       │
│    → Returns: ONE rich page (4-6+ paragraphs)    │
│    → Small JSON → reliable parsing               │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ PHASE 3: WRITE & CROSS-LINK                     │
│                                                 │
│  Write all pages → update index → append log     │
└─────────────────────────────────────────────────┘
```

### Why this design?

**Problem**: Sending the full source to a single "generate everything" call produces shallow pages and unreliable JSON — the LLM skims rather than diving deep, and a 30-page generation crammed into one response often truncates mid-JSON.

**Solution**: Comprehension and generation are different cognitive tasks. Use the model's massive context window (200K tokens) for *understanding* the whole document in one shot, but generate each wiki page in a dedicated call so the model gives it full generative attention.

**Benefits**:
- Each page gets 4-6+ substantive paragraphs instead of stubs
- JSON responses are small and parse reliably
- Sibling page awareness enables consistent cross-referencing
- Progress bar shows "Generating page 3/12: Title" for precise status

### Chunking for very large documents

Sources exceeding ~560K characters (~200 pages at 70% context utilization) are automatically split into chunks:

```typescript
// constants.ts
const MAX_CONTEXT_TOKENS = 140_000;       // 70% of 200K
const MAX_SOURCE_CHARS = 560_000;         // 140K × 4 chars/token
const CHUNK_OVERLAP_CHARS = 2_000;        // paragraph overlap between chunks
```

- Chunks break on paragraph boundaries (`\n\n`) for clean splits
- Each chunk gets its own planning call
- Plans are merged by slug deduplication with combined scopes
- Then per-page generation runs on the unified plan

### Practical document limits

| Document Size | Behavior |
|--------------|----------|
| < 10 pages | Single planning call, 5-8 page generations. Fast. |
| 10-100 pages | Single planning call, 15-40 page generations. |
| 100-200 pages | Single planning call, 30-60 page generations. Slower. |
| 200-600 pages | 2-3 chunked planning calls, merged plan, 40-80 page generations. |
| 600+ pages | Multiple chunks. Works but progressively slower. |

### Pipeline steps (10 steps, 0-indexed)

| Step | Name | What happens |
|------|------|-------------|
| 0 | Reading source | Read source file from `vault/raw/` |
| 1 | Extracting topics | Full source → LLM → `{topics, entities, concepts, keyClaims}` |
| 2 | Finding related pages | Search index for existing pages matching extracted topics |
| 3 | Reading related pages | Load full content of each related wiki page |
| 4 | Planning wiki pages | Full source + topics + existing pages → LLM → `PagePlan` |
| 5 | Generating page content | Per-page loop: each planned page → dedicated LLM call |
| 6 | Writing pages | Write generated pages to `vault/wiki/{category}/` |
| 7 | Updating index | Automatic via wiki-engine's `upsertIndexEntry()` |
| 8 | Appending log | Write to `vault/log.md` |
| 9 | Complete | Return `IngestResult` |

---

## 2. LLM Response Parsing

### The problem

LLMs frequently return malformed JSON:
- Wrapped in ` ```json...``` ` markdown fences
- Surrounded by explanatory prose ("Here is the JSON:\n{...}")
- Trailing commas before `]` or `}`
- Truncated output (response cut off at token limit)
- Valid JSON followed by a concluding sentence

A single parse failure in the page generation step produces **zero pages** silently — the most destructive failure mode.

### The solution: 4-attempt progressive parser

`extractAndParseJson<T>()` in `ingest-engine.ts` tries in order:

1. **Direct parse** — `JSON.parse(raw)` for clean responses
2. **Code fence extraction** — Regex ` ```json...``` `, parse the captured group
3. **Balanced block extraction** — Walk the text character-by-character to find a complete `[...]` or `{...}` block, respecting string escaping. Handles prose-wrapped JSON.
4. **Trailing prose truncation** — Find the last `]` or `}`, extract from first `[` or `{` to there

After extraction, `fixCommonJsonIssues()` runs:
- Strip trailing commas before `]` and `}`
- Close unclosed brackets (truncation recovery) using heuristic array-first-then-object closing

### Error visibility

Every parse failure is logged:
```typescript
log.error("ingest", "Failed to parse LLM JSON response after all attempts", {
  context: "plan-pages",           // which pipeline step
  responseLength: raw.length,
  responsePreview: raw.substring(0, 200),
});
```

This surfaces in the Dev Tools page (`/dev`) so developers can see exactly what the LLM returned and why parsing failed.

---

## 3. Sequential Job Queue

### Design decision

Files are processed **one at a time** via `IngestQueueManager` (singleton). Each job must see wiki updates from the previous job for knowledge compounding.

```
Job A: "sleep-research.pdf" → creates 8 wiki pages
Job B: "insomnia-study.pdf" → reads those 8 pages, adds 3 new, updates 2
```

If processed in parallel, Job B wouldn't see Job A's pages and might create duplicates.

### Implementation

- `IngestQueueManager` is an in-memory singleton (not persisted across restarts)
- Jobs progress through states: `queued → processing → completed | failed`
- Failed jobs retry up to `MAX_RETRY_COUNT` (3) with exponential backoff (2s, 4s, 8s)
- Event emitter pattern for real-time UI updates via polling (`useQueue` hook polls every 1s)
- `setImmediate()` chains the next job after completion

### Why not SSE/WebSocket for queue updates?

The current polling approach works for single-user scenarios. SSE would be better for:
- Multi-user deployments
- Very long ingestion jobs where per-second updates matter
- Reducing unnecessary HTTP requests

This is a Phase 2 consideration.

---

## 4. Provider-Agnostic LLM Layer

### Architecture

```
ILLMProvider (interface)
├── OpenAIProvider      — OpenAI API (gpt-4o, o1, etc.)
├── AnthropicProvider   — Anthropic API (Claude)
└── CustomOpenAIProvider — Any OpenAI-compatible endpoint
```

### Custom provider design

`CustomOpenAIProvider` uses the OpenAI SDK with a custom `baseURL` and `defaultHeaders`. This works with:
- Ollama (`http://localhost:11434/v1`)
- LM Studio (`http://localhost:1234/v1`)
- Groq, Together AI, OpenRouter
- Custom endpoints like `api.z.ai`

### Error recovery

The custom provider catches 400 errors and retries without optional parameters (`temperature`, `max_tokens`) because some endpoints reject them:

```typescript
if (error instanceof Error && error.message.includes("400")) {
  // Retry with just model + messages
}
```

This was needed because `glm-5-turbo` via `api.z.ai` rejected certain parameter combinations.

### Type safety

The provider uses `ChatCompletionCreateParamsNonStreaming` and `ChatCompletionCreateParamsStreaming` types explicitly to avoid the `stream: true | false` union type ambiguity in the OpenAI SDK.

---

## 5. Vault Filesystem Design

### Obsidian compatibility

The vault is a directory of plain markdown files with YAML frontmatter. Every page can be opened in Obsidian for:
- Graph view (via `[[wiki-links]]`)
- Back-link navigation
- Full-text search
- Tag-based filtering

### File structure

```
vault/
├── .settings.json              ← LLM config (API key, model, provider)
├── raw/                        ← Immutable source documents
│   └── my-article.pdf.md       ← Parsed text from uploaded files
├── wiki/
│   ├── concepts/
│   │   └── circadian-rhythm.md
│   ├── entities/
│   │   └── matthew-walker.md
│   ├── sources/
│   │   └── why-we-sleep.md
│   └── topics/
│       └── sleep.md
├── index.md                    ← Structured catalog of all pages
├── log.md                      ← Chronological activity log
├── SCHEMA.md                   ← Conventions the LLM reads
└── home.md                     ← Wiki home page
```

### Frontmatter format

Every wiki page has this YAML frontmatter:

```yaml
---
title: Page Title
category: concepts
created: "2026-04-07T12:00:00.000Z"
updated: "2026-04-07T12:00:00.000Z"
tags: [tag1, tag2]
sourceCount: 2
sources: [source-1.pdf, source-2.docx]
related: [[other-page]]
---
```

### Index format

`index.md` uses a structured format that both the LLM and code can parse:

```markdown
## Concepts
- [[slug]] — One-line summary
```

The `index-manager.ts` parses this with regex and supports CRUD operations. The LLM reads this during planning to understand existing wiki content.

### Why file-based instead of a database?

- **Portability**: Can be opened in Obsidian, VS Code, or any markdown editor
- **Simplicity**: No database setup, migrations, or ORM
- **Git-friendly**: Track knowledge evolution in version control
- **Future-proof**: Easy to migrate to SQLite/Turso later if needed

---

## 6. Developer Observability

### Components

| Component | File | Purpose |
|-----------|------|---------|
| Structured Logger | `src/lib/core/logger.ts` | Categorized, timestamped, queryable logs |
| LLM Inspector | `src/lib/core/llm-inspector.ts` | Tracks every LLM call with timing, tokens, I/O |
| Dev Tools API | `src/app/api/dev/route.ts` | Exposes logs + LLM records via REST |
| Dev Tools UI | `src/app/dev/dev-content.tsx` | Real-time dashboard at `/dev` |

### Logger design

```typescript
log.info("ingest", "Source queued", { jobId: "abc", sourceFile: "raw/test.pdf" });
log.error("llm", "LLM call failed", { step: "generate", error: "timeout" });
log.timer("ingest", "Full pipeline")();  // returns duration in ms
```

- In-memory ring buffer (max 2000 entries)
- Subscribers for real-time UI updates
- Categories: `ingest`, `query`, `llm`, `vault`, `parse`, `system`
- Levels: `debug`, `info`, `warn`, `error`
- Auto-outputs to console with emoji prefixes (❌ ⚠️ 🔍 ℹ️)

### LLM Inspector

Records every LLM call:
```typescript
llmInspector.record({
  provider: "custom",
  model: "glm-5-turbo",
  step: "generate-circadian-rhythm",
  jobId: "abc-123",
  messages: [{ role: "user", content: "..." }],
  response: "Full response text...",
  tokenUsage: { promptTokens: 4500, completionTokens: 1200, totalTokens: 5700 },
  durationMs: 3200,
});
```

- In-memory buffer (max 500 records)
- Tracks: prompt previews, response previews, token usage, timing, errors
- Stats: total calls, errors, total tokens, average duration

### When to check Dev Tools

- **Zero pages generated** → Check LLM Inspector for the generate step. The response was likely malformed JSON.
- **Slow ingestion** → Check LLM call durations. Some models are slower on large inputs.
- **Token usage tracking** → Stats show cumulative token spend.
- **Error patterns** → Filter by status=error to see all failed LLM calls.

---

## 7. Design System — The Editorial Wiki

### Philosophy: "The Digital Curator"

The UI treats knowledge with editorial reverence — generous whitespace, tonal layering, and a sophisticated palette. Not a utility dashboard, but a sanctuary for knowledge.

### Color architecture

**Light mode**: Deep oceanic blues (`#091426`) + slate grays (`#515f74`) + Old Gold accents (`#fbe0a3`)
**Dark mode**: Inverted with warm grays and muted blues

### Surface hierarchy (tonal layering)

No explicit borders. Boundaries are created by background color shifts between surface tiers:

```
surface (#f7f9fb)               — The "desk" everything sits on
  └── surface-container-low (#f2f4f6)     — Large body sections
       └── surface-container-lowest (#fff)   — Cards that "pop"
            └── surface-container-high (#e6e8ea) — Subtle overlays
```

### Key rules

| Rule | Implementation |
|------|---------------|
| **No-Line Rule** | Borders use `rgba(197, 198, 205, 0.15)` — ghost borders at 15% opacity |
| **Ambient Shadows** | `0 32px 64px -12px rgba(9, 20, 38, 0.06)` — tinted with primary, not black |
| **Premium Gradient** | `linear-gradient(135deg, #091426, #1e293b)` for CTAs |
| **Gold Accent** | `tertiary-fixed` (#fbe0a3) for active sidebar state and highlights only |
| **Text** | Never pure `#000`. Always `#191c1e` (`on-surface`) for softer contrast |
| **Glass header** | `bg-surface/80 backdrop-blur-xl` |

### Typography

- **Font**: Manrope (via `next/font/google`, weights 300-800)
- **Headlines**: Tight tracking (`tracking-tighter`) for editorial masthead feel
- **Labels**: `text-[10px] uppercase tracking-widest` for metadata footnotes
- **Body**: `line-height: 1.7` for comfortable long-form reading

---

## 8. Prompt Engineering Strategy

### Strict JSON output

Every prompt ends with `JSON_INSTRUCTION`:
```
CRITICAL OUTPUT RULES:
1. Output ONLY raw JSON. No markdown fences, no backticks, no explanation.
2. The very first character must be { or [ and the last must be } or ].
3. If you cannot produce valid JSON, output an empty object: {}
```

This is reinforced verbally AND structurally. The parser still handles failures gracefully.

### Prompt architecture per pipeline step

| Step | Prompt | Input | Output |
|------|--------|-------|--------|
| Extract Topics | `extractTopicsPrompt()` | Full source | `{topics, entities, concepts, keyClaims}` |
| Plan Pages | `planWikiPagesPrompt()` | Full source + topics + existing pages | `{pages: PagePlanEntry[], summary, contradictions}` |
| Generate Page | `generateSinglePagePrompt()` | Full source + page plan + siblings + existing | Single `PageGeneration` object |

### Why per-page generation prompts include the full source

The LLM needs the full source as reference material when writing a page about "circadian rhythm" — the relevant content might be scattered across paragraphs 3, 15, and 47. With 200K context, this fits easily. The trade-off is more tokens per call, but the quality improvement is significant.

### Sibling page awareness

Each per-page prompt includes the list of all other planned pages:
```
SIBLING PAGES (use [[wiki-links]] to reference these):
- [[circadian-rhythm]] (concepts): The body's internal 24-hour clock
- [[rem-sleep]] (concepts): Rapid eye movement sleep phase
- [[matthew-walker]] (entities): Neuroscience professor at UC Berkeley
```

This ensures consistent cross-referencing — the LLM knows what other pages exist and can link to them.

---

## 9. Key Configuration & Constants

### `vault/.settings.json`

```json
{
  "provider": "custom",
  "apiKey": "...",
  "model": "glm-5-turbo",
  "temperature": 0.3,
  "maxTokens": 4096,
  "customBaseUrl": "https://api.z.ai/api/coding/paas/v4",
  "customHeaders": {}
}
```

### `src/lib/config/constants.ts`

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_SOURCE_CHARS` | 560,000 | Max source chars per LLM call (70% of 200K tokens) |
| `MAX_CONTEXT_TOKENS` | 140,000 | Token budget per call |
| `CHUNK_OVERLAP_CHARS` | 2,000 | Overlap between chunks |
| `MAX_RETRY_COUNT` | 3 | Job retry attempts |
| `RETRY_BASE_DELAY_MS` | 2,000 | Exponential backoff base |
| `generationTokens` | `min(maxTokens × 4, 16384)` | Output token limit for page generation |

### In-memory limits

| Component | Max entries | Rationale |
|-----------|------------|-----------|
| Logger ring buffer | 2,000 | Covers ~30 min of heavy use |
| LLM Inspector buffer | 500 | Covers ~20 full ingestion jobs |
| Job queue | Unlimited | Cleared manually via UI |

---

*Last updated: 2026-04-07*
