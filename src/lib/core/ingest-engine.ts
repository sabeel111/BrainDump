/**
 * Ingest pipeline — "Plan Once, Generate Per-Page" architecture.
 *
 * Phase 1: Full-context comprehension (extract topics + plan pages)
 * Phase 2: Focused per-page generation (one LLM call per planned page)
 * Phase 3: Write all pages to vault + update index
 *
 * All pipeline steps handle chunking for sources that exceed context limits.
 */

import { v4 as uuidv4 } from "uuid";
import { createProvider } from "../llm/provider";
import { loadSettings } from "../config/settings";
import {
  INGEST_STEPS,
  MAX_RETRY_COUNT,
  RETRY_BASE_DELAY_MS,
  MAX_SOURCE_CHARS,
  CHUNK_OVERLAP_CHARS,
  CHARS_PER_TOKEN,
} from "../config/constants";
import { readVaultFile } from "./vault";
import { readWikiPage } from "./wiki-engine";
import { findRelatedPages } from "./index-manager";
import { appendLog } from "./log-manager";
import { log } from "./logger";
import { llmInspector } from "./llm-inspector";
import {
  extractTopicsPrompt,
  planWikiPagesPrompt,
  generateSinglePagePrompt,
} from "../llm/prompts";
import { processRawMarkdownPage } from "./page-pipeline";
import type { IngestJob, IngestResult, QueueStatus } from "@/types";
import type {
  ExtractedTopics,
  PagePlan,
  PagePlanEntry,
  Contradiction,
} from "@/types";

// ============================================================
// ROBUST JSON PARSER
// ============================================================

function extractAndParseJson<T>(raw: string, fallback: T, context?: string): T {
  if (!raw || !raw.trim()) {
    log.warn("ingest", "Empty LLM response, using fallback", { context });
    return fallback;
  }

  const trimmed = raw.trim();

  // Attempt 1: Direct parse
  try { return JSON.parse(trimmed) as T; } catch { /* continue */ }

  // Attempt 2: Strip markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()) as T; } catch { /* continue */ }
  }

  // Attempt 3: Extract balanced JSON block from surrounding text
  const jsonCandidate = extractJsonBlock(trimmed);
  if (jsonCandidate) {
    try {
      return JSON.parse(jsonCandidate) as T;
    } catch {
      const fixed = fixCommonJsonIssues(jsonCandidate);
      try { return JSON.parse(fixed) as T; } catch { /* continue */ }
    }
  }

  // Attempt 4: Truncate trailing prose after the last ] or }
  const lastClose = Math.max(trimmed.lastIndexOf("]"), trimmed.lastIndexOf("}"));
  if (lastClose > 0) {
    const firstOpen = trimmed.search(/[{[]/);
    if (firstOpen >= 0) {
      try { return JSON.parse(trimmed.substring(firstOpen, lastClose + 1)) as T; } catch { /* give up */ }
    }
  }

  log.error("ingest", "Failed to parse LLM JSON response after all attempts", {
    context, responseLength: raw.length, responsePreview: raw.substring(0, 200),
  });

  return fallback;
}

function extractJsonBlock(text: string): string | null {
  const arrayStart = text.indexOf("[");
  const objectStart = text.indexOf("{");
  if (arrayStart === -1 && objectStart === -1) return null;

  if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
    const block = findBalanced(text, "[", "]", arrayStart);
    if (block) return block;
  }
  if (objectStart !== -1) return findBalanced(text, "{", "}", objectStart);
  return null;
}

function findBalanced(text: string, open: string, close: string, startIdx: number): string | null {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === "\\" && inString) { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    if (ch === close) { depth--; if (depth === 0) return text.substring(startIdx, i + 1); }
  }
  return null;
}

function fixCommonJsonIssues(json: string): string {
  let fixed = json.replace(/,\s*([}\]])/g, "$1");
  const opens = (fixed.match(/[{[]/g) || []).length;
  const closes = (fixed.match(/[}\]]/g) || []).length;
  const missing = opens - closes;
  if (missing > 0) {
    const lastClose = Math.max(fixed.lastIndexOf("}"), fixed.lastIndexOf("]"));
    if (lastClose > 0) {
      let candidate = fixed.substring(0, lastClose + 1);
      for (let i = 0; i < missing; i++) {
        const openArr = (candidate.match(/\[/g) || []).length;
        const closeArr = (candidate.match(/\]/g) || []).length;
        candidate += openArr > closeArr ? "]" : "}";
      }
      fixed = candidate;
    }
  }
  return fixed;
}

// ============================================================
// SOURCE CHUNKING
// ============================================================

/**
 * Split source text into chunks that fit within the context window.
 * Tries to split on paragraph boundaries for clean breaks.
 * Reserve room for the system prompt (~2000 chars).
 */
function chunkSource(text: string, maxChars: number = MAX_SOURCE_CHARS): string[] {
  // Reserve ~2000 chars for system prompt overhead
  const effectiveMax = Math.max(maxChars - 2000, 4000);

  if (text.length <= effectiveMax) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + effectiveMax, text.length);

    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + effectiveMax * 0.5) {
        end = paragraphBreak + 2;
      } else {
        const lineBreak = text.lastIndexOf("\n", end);
        if (lineBreak > start + effectiveMax * 0.5) end = lineBreak + 1;
      }
    }

    chunks.push(text.substring(start, end));
    const nextStart = end - CHUNK_OVERLAP_CHARS;
    start = nextStart > start ? nextStart : end;

    if (chunks.length > 20) {
      log.warn("ingest", `Source produced >20 chunks, truncating to 20`, { totalChars: text.length });
      break;
    }
  }

  return chunks;
}

/** Merge multiple extracted topic sets, deduplicating. */
function mergeTopicsResults(results: ExtractedTopics[]): ExtractedTopics {
  const topicSet = new Set<string>();
  const entitySet = new Set<string>();
  const conceptSet = new Set<string>();
  const claims: string[] = [];

  for (const r of results) {
    for (const t of r.topics) topicSet.add(t);
    for (const e of r.entities) entitySet.add(e);
    for (const c of r.concepts) conceptSet.add(c);
    for (const k of r.keyClaims) { if (!claims.includes(k)) claims.push(k); }
  }

  return {
    topics: Array.from(topicSet),
    entities: Array.from(entitySet),
    concepts: Array.from(conceptSet),
    keyClaims: claims,
  };
}

/** Merge multiple PagePlans, deduplicating by slug. */
function mergePlans(plans: PagePlan[]): PagePlan {
  const seenSlugs = new Map<string, PagePlanEntry>();
  const allContradictions: Contradiction[] = [];
  let bestSummary = "";

  for (const plan of plans) {
    if (!bestSummary && plan.summary) bestSummary = plan.summary;
    for (const c of plan.contradictions || []) allContradictions.push(c);

    for (const page of plan.pages) {
      const existing = seenSlugs.get(page.slug);
      if (!existing) {
        seenSlugs.set(page.slug, page);
      } else {
        if (page.scope && !existing.scope.includes(page.scope)) {
          existing.scope += `; also: ${page.scope}`;
        }
        for (const tag of page.tags) {
          if (!existing.tags.includes(tag)) existing.tags.push(tag);
        }
      }
    }
  }

  return {
    pages: Array.from(seenSlugs.values()),
    summary: bestSummary,
    contradictions: allContradictions,
  };
}

// ============================================================
// JOB QUEUE
// ============================================================

class IngestQueueManager {
  private jobs: IngestJob[] = [];
  private currentJob: IngestJob | null = null;
  private isProcessing = false;
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  async enqueue(sourceFile: string, sourceName: string): Promise<string> {
    const job: IngestJob = {
      id: uuidv4(), status: "queued", sourceFile, sourceName,
      addedAt: new Date().toISOString(), retryCount: 0,
    };
    this.jobs.push(job);
    this.emit("job:added", job);
    log.info("ingest", `Source queued: ${sourceName}`, { jobId: job.id, sourceFile });
    if (!this.isProcessing) this.processNext();
    return job.id;
  }

  async enqueueMany(sources: Array<{ file: string; name: string }>): Promise<string[]> {
    const ids: string[] = [];
    for (const source of sources) ids.push(await this.enqueue(source.file, source.name));
    return ids;
  }

  getStatus(): QueueStatus {
    return {
      jobs: [...this.jobs],
      currentJob: this.currentJob ? { ...this.currentJob } : null,
      totalQueued: this.jobs.filter((j) => j.status === "queued").length,
      totalCompleted: this.jobs.filter((j) => j.status === "completed").length,
      totalFailed: this.jobs.filter((j) => j.status === "failed").length,
      isProcessing: this.isProcessing,
    };
  }

  async retry(jobId: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job || job.status !== "failed") return;
    job.status = "queued"; job.error = undefined;
    this.emit("job:updated", job);
    if (!this.isProcessing) this.processNext();
  }

  cancel(jobId: string): boolean {
    const idx = this.jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return false;
    const job = this.jobs[idx];
    if (job.status !== "queued") return false;
    this.jobs.splice(idx, 1);
    this.emit("job:removed", jobId);
    return true;
  }

  clearHistory(): void {
    this.jobs = this.jobs.filter((j) => j.status === "queued" || j.status === "processing");
    this.emit("queue:cleared");
  }

  on(event: string, callback: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((cb) => cb(...args));
  }

  private updateStep(job: IngestJob, stepIndex: number, detail?: string): void {
    job.currentStep = stepIndex;
    job.stepDescription = detail || INGEST_STEPS[stepIndex];
    this.emit("job:progress", job);
  }

  private async processNext(): Promise<void> {
    const nextJob = this.jobs.find((j) => j.status === "queued");
    if (!nextJob) { this.isProcessing = false; this.emit("queue:empty"); return; }

    this.isProcessing = true;
    this.currentJob = nextJob;
    nextJob.status = "processing";
    nextJob.startedAt = new Date().toISOString();
    nextJob.currentStep = 0;
    nextJob.totalSteps = INGEST_STEPS.length;
    this.emit("job:updated", nextJob);

    log.info("ingest", `Starting ingestion: ${nextJob.sourceName}`, { jobId: nextJob.id });

    try {
      const result = await this.runPipeline(nextJob);
      nextJob.status = "completed";
      nextJob.completedAt = new Date().toISOString();
      nextJob.result = result;
      nextJob.currentStep = INGEST_STEPS.length - 1;
      nextJob.stepDescription = INGEST_STEPS[INGEST_STEPS.length - 1];
      this.emit("job:completed", nextJob);
      log.info("ingest", `Ingestion complete: ${nextJob.sourceName}`, {
        jobId: nextJob.id,
        pagesCreated: result.pagesCreated.length,
        pagesUpdated: result.pagesUpdated.length,
      });
    } catch (error) {
      nextJob.retryCount++;
      const errMsg = error instanceof Error ? error.message : "Unknown error";

      // Don't retry prompt-too-long errors — the same prompt will fail again
      const isPromptTooLong = errMsg.toLowerCase().includes("prompt exceeds") ||
        errMsg.toLowerCase().includes("max length") ||
        errMsg.toLowerCase().includes("context length") ||
        errMsg.toLowerCase().includes("too many tokens");

      if (isPromptTooLong) {
        log.error("ingest", `Prompt too long — skipping retries`, { jobId: nextJob.id, error: errMsg });
        nextJob.retryCount = MAX_RETRY_COUNT; // skip all retries
      }

      if (nextJob.retryCount < MAX_RETRY_COUNT) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, nextJob.retryCount - 1);
        log.warn("ingest", `Job failed, retrying (${nextJob.retryCount}/${MAX_RETRY_COUNT})`, {
          jobId: nextJob.id, error: errMsg,
        });
        await new Promise((r) => setTimeout(r, delay));
        nextJob.status = "queued";
        nextJob.error = errMsg;
        this.emit("job:retry", nextJob);
      } else {
        nextJob.status = "failed";
        nextJob.error = errMsg;
        this.emit("job:failed", nextJob);
        log.error("ingest", `Job failed permanently: ${nextJob.sourceName}`, {
          jobId: nextJob.id, error: errMsg,
        });
      }
    }

    this.currentJob = null;
    setImmediate(() => this.processNext());
  }

  // ============================================================
  // LLM CALL HELPER
  // ============================================================

  private async callLLM(
    provider: ReturnType<typeof createProvider>,
    messages: Array<{ role: string; content: string }>,
    step: string,
    jobId: string,
    model: string,
    providerName: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const start = performance.now();

    // Log the total prompt size for debugging context limits
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const estimatedTokens = Math.round(totalChars / CHARS_PER_TOKEN);
    log.debug("llm", `Sending ${step}: ~${estimatedTokens} tokens (${totalChars} chars)`, { jobId, step });

    try {
      const result = await provider.complete({
        messages: messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });

      const durationMs = Math.round(performance.now() - start);

      log.info("llm", `LLM call: ${step}`, {
        jobId, step, durationMs,
        tokens: result.usage?.totalTokens || 0,
        responseLength: result.content.length,
        inputChars: totalChars,
      });

      llmInspector.record({
        provider: providerName, model, step, jobId,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        response: result.content,
        tokenUsage: result.usage,
        durationMs,
      });

      return result.content;
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const errMsg = error instanceof Error ? error.message : "Unknown error";

      log.error("llm", `LLM call failed: ${step}`, {
        jobId, step, error: errMsg, inputChars: totalChars, estimatedTokens,
      });

      llmInspector.record({
        provider: providerName, model, step, jobId,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        response: "", durationMs, error: errMsg,
      });

      throw error;
    }
  }

  // ============================================================
  // MAIN PIPELINE
  // ============================================================

  private async runPipeline(job: IngestJob): Promise<IngestResult> {
    const config = await loadSettings();
    const provider = createProvider(config);
    const model = config.model;
    const providerName = config.provider;
    const generationTokens = Math.min(config.maxTokens * 4, 16384);

    // Step 0: Read source
    this.updateStep(job, 0);
    const sourceContent = await readVaultFile(job.sourceFile);
    log.info("ingest", `Source read: ${sourceContent.length} chars (~${Math.round(sourceContent.length / CHARS_PER_TOKEN)} tokens)`, {
      jobId: job.id,
    });

    // Step 1: Extract topics — chunk if needed
    this.updateStep(job, 1);
    const topicChunks = chunkSource(sourceContent);
    let topics: ExtractedTopics;

    if (topicChunks.length === 1) {
      log.info("ingest", `Extracting topics from full source`, { jobId: job.id });
      const topicsRaw = await this.callLLM(
        provider,
        extractTopicsPrompt(sourceContent),
        "extract-topics", job.id, model, providerName,
        { temperature: 0.2 }
      );
      topics = extractAndParseJson<ExtractedTopics>(topicsRaw, {
        topics: [], entities: [], concepts: [], keyClaims: [],
      }, "extract-topics");
    } else {
      log.info("ingest", `Extracting topics from ${topicChunks.length} chunks`, { jobId: job.id });
      const allTopics: ExtractedTopics[] = [];
      for (let i = 0; i < topicChunks.length; i++) {
        this.updateStep(job, 1, `Extracting topics: chunk ${i + 1}/${topicChunks.length}`);
        const topicsRaw = await this.callLLM(
          provider,
          extractTopicsPrompt(topicChunks[i]),
          `extract-topics-chunk-${i + 1}`, job.id, model, providerName,
          { temperature: 0.2 }
        );
        const chunkTopics = extractAndParseJson<ExtractedTopics>(topicsRaw, {
          topics: [], entities: [], concepts: [], keyClaims: [],
        }, `extract-topics-chunk-${i + 1}`);
        allTopics.push(chunkTopics);
      }
      topics = mergeTopicsResults(allTopics);
    }

    log.info("ingest", `Topics extracted: ${topics.topics.length} topics, ${topics.entities.length} entities, ${topics.concepts.length} concepts`, {
      jobId: job.id, topics: topics.topics, entities: topics.entities,
    });

    // Step 2: Find related pages
    this.updateStep(job, 2);
    const allTopicStrings = [...topics.topics, ...topics.entities, ...topics.concepts];
    const relatedEntries = await findRelatedPages(allTopicStrings);

    // Step 3: Read related pages
    this.updateStep(job, 3);
    const relatedPages: Array<{ slug: string; title: string; content: string }> = [];
    for (const entry of relatedEntries) {
      const page = await readWikiPage(entry.slug);
      if (page) relatedPages.push({ slug: page.slug, title: page.title, content: page.content });
    }
    log.info("ingest", `Found ${relatedPages.length} related wiki pages`, { jobId: job.id });

    // Step 4: Plan wiki pages — chunk if needed
    this.updateStep(job, 4);
    const schema = await readVaultFile("SCHEMA.md").catch(() => "");
    const planChunks = chunkSource(sourceContent);

    let plan: PagePlan;

    if (planChunks.length === 1) {
      log.info("ingest", `Planning pages from full source`, { jobId: job.id });
      const planRaw = await this.callLLM(
        provider,
        planWikiPagesPrompt(job.sourceName, sourceContent, topics, relatedPages, schema),
        "plan-pages", job.id, model, providerName,
        { temperature: 0.2, maxTokens: generationTokens }
      );
      plan = extractAndParseJson<PagePlan>(planRaw, {
        pages: [], summary: "", contradictions: [],
      }, "plan-pages");
    } else {
      log.info("ingest", `Planning pages from ${planChunks.length} chunks`, { jobId: job.id });
      const chunkPlans: PagePlan[] = [];
      for (let i = 0; i < planChunks.length; i++) {
        this.updateStep(job, 4, `Planning chunk ${i + 1}/${planChunks.length}`);
        const planRaw = await this.callLLM(
          provider,
          planWikiPagesPrompt(`${job.sourceName} (part ${i + 1})`, planChunks[i], topics, relatedPages, schema),
          `plan-chunk-${i + 1}`, job.id, model, providerName,
          { temperature: 0.2, maxTokens: generationTokens }
        );
        const chunkPlan = extractAndParseJson<PagePlan>(planRaw, {
          pages: [], summary: "", contradictions: [],
        }, `plan-chunk-${i + 1}`);
        chunkPlans.push(chunkPlan);
      }
      plan = mergePlans(chunkPlans);
    }

    log.info("ingest", `Page plan: ${plan.pages.length} pages, ${plan.contradictions.length} contradictions`, {
      jobId: job.id, pages: plan.pages.map((p) => p.slug),
    });

    // Step 5+6: Generate content and write each page
    // The LLM returns raw markdown — no JSON parsing needed.
    // All metadata (slug, title, category, tags, isNew) comes from the plan.
    this.updateStep(job, 5);
    const pagesCreated: string[] = [];
    const pagesUpdated: string[] = [];
    const pageWarnings: string[] = [];
    let pagesGenerated = 0;

    for (let i = 0; i < plan.pages.length; i++) {
      const pagePlan = plan.pages[i];
      this.updateStep(job, 5, `Generating page ${i + 1}/${plan.pages.length}: ${pagePlan.title}`);

      let existingContent: string | null = null;
      if (!pagePlan.isNew) {
        const existing = await readWikiPage(pagePlan.slug);
        existingContent = existing?.content || null;
      }

      try {
        // Select the right source chunk for this page
        const genChunks = chunkSource(sourceContent);
        const sourceForPage = genChunks.length === 1
          ? sourceContent
          : this.findBestChunk(genChunks, pagePlan);

        // Call LLM — returns raw markdown, not JSON
        const rawMarkdown = await this.callLLM(
          provider,
          generateSinglePagePrompt(pagePlan, job.sourceName, sourceForPage, plan.pages, existingContent, schema),
          `generate-${pagePlan.slug}`, job.id, model, providerName,
          { temperature: 0.3, maxTokens: generationTokens }
        );

        pagesGenerated++;

        // Write directly via page pipeline — no JSON parsing
        this.updateStep(job, 6, `Writing page ${i + 1}/${plan.pages.length}: ${pagePlan.slug}`);
        const result = await processRawMarkdownPage(
          rawMarkdown,
          pagePlan,
          job.sourceName,
          job.id,
        );

        if (result.action === "created") {
          pagesCreated.push(result.slug);
        } else if (result.action === "updated") {
          pagesUpdated.push(result.slug);
        }
        if (result.error) {
          log.error("ingest", `Pipeline failed for: ${result.slug}`, {
            jobId: job.id, error: result.error, warnings: result.warnings,
          });
        }
        if (result.warnings.length > 0) {
          pageWarnings.push(...result.warnings);
        }
      } catch (err) {
        log.error("ingest", `Failed to generate page: ${pagePlan.slug}`, {
          jobId: job.id, error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.info("ingest", `Generated ${pagesGenerated}/${plan.pages.length} pages. Written: ${pagesCreated.length} created, ${pagesUpdated.length} updated`, {
      jobId: job.id, warnings: pageWarnings.length,
    });

    // Step 7: Update index
    this.updateStep(job, 7);

    // Step 8: Append log
    this.updateStep(job, 8);
    await appendLog("ingest", job.sourceName, `Ingested source: ${job.sourceName}. ${plan.summary}`, pagesCreated, pagesUpdated);

    // Step 9: Complete
    this.updateStep(job, 9);

    return {
      pagesCreated, pagesUpdated,
      contradictionsFound: plan.contradictions.length,
      warnings: plan.contradictions.map((c) => `Contradiction in [[${c.existingPage}]]: ${c.recommendation}`),
    };
  }

  /**
   * Find the most relevant chunk for a given page plan.
   * Uses keyword matching from the page's scope and title.
   */
  private findBestChunk(chunks: string[], pagePlan: PagePlanEntry): string {
    const keywords = [
      ...pagePlan.title.toLowerCase().split(/\s+/),
      ...pagePlan.scope.toLowerCase().split(/\s+/),
      ...pagePlan.tags.map((t) => t.toLowerCase()),
    ].filter((w) => w.length > 3); // skip short words

    let bestScore = -1;
    let bestIdx = 0;

    for (let i = 0; i < chunks.length; i++) {
      const lower = chunks[i].toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        const count = (lower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
        score += count;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    log.debug("ingest", `Best chunk for "${pagePlan.title}": chunk ${bestIdx + 1}/${chunks.length} (score: ${bestScore})`);
    return chunks[bestIdx];
  }
}

// Singleton
let queueInstance: IngestQueueManager | null = null;

export function getIngestQueue(): IngestQueueManager {
  if (!queueInstance) queueInstance = new IngestQueueManager();
  return queueInstance;
}
