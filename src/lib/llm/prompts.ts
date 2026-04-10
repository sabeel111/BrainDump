/**
 * Prompt templates for LLM calls.
 * All prompts demand STRICT JSON output with no surrounding text.
 * Designed for large-context models (200K+ tokens).
 */

import type { LLMMessage, PagePlanEntry, Contradiction } from "@/types";
import type { ChatMessage } from "@/types/chat";

const JSON_INSTRUCTION = `\nCRITICAL OUTPUT RULES:
1. Output ONLY raw JSON. No markdown fences, no backticks, no explanation, no commentary.
2. Do NOT wrap the JSON in \`\`\`json\`\`\` code blocks.
3. Do NOT add any text before or after the JSON.
4. The very first character of your response must be { or [ and the very last character must be } or ].
5. If you cannot produce valid JSON, output an empty object: {}`;

// ============================================================
// PHASE 1: FULL-CONTEXT COMPREHENSION
// ============================================================

/**
 * Step 1: Extract topics, entities, concepts from FULL source.
 * No truncation — leverages large context windows.
 */
export function extractTopicsPrompt(sourceContent: string): LLMMessage[] {
  return [
    {
      role: "system",
      content: `You are a knowledge extraction assistant. Analyze the given source document and extract structured information.

Return a JSON object with these fields:
- "topics": array of broad topic strings (e.g., ["sleep", "health", "neuroscience"])
- "entities": array of named entities — people, organizations, products (e.g., ["Matthew Walker", "NIH"])
- "concepts": array of specific concepts or theories (e.g., ["circadian rhythm", "sleep debt", "REM sleep"])
- "keyClaims": array of the most important claims or findings from the source

Be thorough. Extract everything that could be relevant for cross-referencing.
${JSON_INSTRUCTION}`,
    },
    {
      role: "user",
      content: `Analyze this source document and extract its key topics, entities, concepts, and claims:\n\n${sourceContent}`,
    },
  ];
}

/**
 * Step 4: Plan wiki pages from FULL source + existing pages + topics.
 * Returns a list of pages to create/update (no content yet — just scope).
 */
export function planWikiPagesPrompt(
  sourceName: string,
  sourceContent: string,
  topics: { topics: string[]; entities: string[]; concepts: string[]; keyClaims: string[] },
  existingPages: Array<{ slug: string; title: string; content: string }>,
  schema: string
): LLMMessage[] {
  const existingContext = existingPages
    .map((p) => `--- PAGE: ${p.slug} (${p.title}) ---\n${p.content.substring(0, 3000)}`)
    .join("\n\n");

  const topicsStr = JSON.stringify(topics, null, 2);

  return [
    {
      role: "system",
      content: `You are a knowledge architecture planner. Your job is to read a source document, understand its full content, compare it against existing wiki pages, and produce a PLAN for which wiki pages to create or update.

You do NOT write page content. You only plan.

WIKI SCHEMA:
${schema}

Return a JSON object:
{
  "pages": [
    {
      "slug": "page-slug",
      "title": "Page Title",
      "category": "concepts" | "entities" | "sources" | "topics",
      "tags": ["tag1", "tag2"],
      "isNew": true,
      "scope": "A 1-2 sentence description of exactly what this page should cover and why it matters"
    }
  ],
  "summary": "2-3 sentence summary of the source",
  "contradictions": [
    {
      "existingPage": "page-slug",
      "existingClaim": "what the wiki currently says",
      "newClaim": "what the new source says instead",
      "severity": "high" | "medium" | "low",
      "recommendation": "how to resolve this"
    }
  ]
}

PLANNING RULES:
- Include a source summary page (category: "sources") for every source
- Create pages for every distinct concept, entity, or topic mentioned in the source
- For existing pages that need updates: set "isNew": false and use the exact existing slug, describe in "scope" what new info to add
- Be specific in "scope" — this guides the page writer later
- Aim for 3-8 pages for a short article, 10-30 pages for a long document, 30-60 pages for a book-length source
- Each page should be a distinct knowledge unit, not a duplicate of another
${JSON_INSTRUCTION}`,
    },
    {
      role: "user",
      content: `SOURCE: "${sourceName}"\n\n${sourceContent}\n\nEXTRACTED TOPICS:\n${topicsStr}\n\nEXISTING WIKI PAGES:\n${existingContext || "(no existing pages yet)"}`,
    },
  ];
}

// ============================================================
// PHASE 2: PER-PAGE GENERATION
// ============================================================

/**
 * Generate content for a SINGLE planned wiki page.
 * Receives the full source for reference + the page plan so it knows sibling pages.
 */
export function generateSinglePagePrompt(
  pagePlan: PagePlanEntry,
  sourceName: string,
  sourceContent: string,
  allPlannedPages: PagePlanEntry[],
  existingPageContent: string | null,
  schema: string
): LLMMessage[] {
  const siblingPages = allPlannedPages
    .filter((p) => p.slug !== pagePlan.slug)
    .map((p) => `- [[${p.slug}]] (${p.category}): ${p.scope}`)
    .join("\n");

  const existingSection = existingPageContent
    ? `\nEXISTING PAGE CONTENT (append new info to this):\n${existingPageContent.substring(0, 4000)}`
    : "";

  const updateInstruction = !pagePlan.isNew
    ? `\n- Start with: ## Update from "${sourceName}"`
    : "";

  return [
    {
      role: "system",
      content: `You are a wiki page writer. Write the page described below.

WIKI SCHEMA:
${schema}

CONTENT RULES:
- Write FULL, substantive content — at least 4-6 paragraphs
- Use [[wiki-links]] to cross-reference other pages (especially the sibling pages listed below)
- Use proper markdown: headings (##, ###), bullet lists, **bold** for key terms
- Start with a definition or overview at the top, then detailed sections
- Mark any contradictions with > ⚠️ **Contradiction** blockquotes${updateInstruction}

OUTPUT FORMAT:
- Output ONLY raw markdown. No JSON, no code fences, no explanation.
- Do NOT include YAML frontmatter (---).
- The very first character of your response must be the start of the markdown content.
- Write the content as if it were the body of a Wikipedia article.`,
    },
    {
      role: "user",
      content: `PAGE TO WRITE: "${pagePlan.title}" (${pagePlan.category})
SCOPE: ${pagePlan.scope}

SOURCE: "${sourceName}"
${sourceContent}

SIBLING PAGES (use [[wiki-links]] to reference these):
${siblingPages}
${existingSection}`,
    },
  ];
}

// ============================================================
// QUERY PIPELINE PROMPTS
// ============================================================

export function analyzeQueryPrompt(question: string, indexContent: string, history?: ChatMessage[]): LLMMessage[] {
  const historyNote = history && history.length > 0
    ? "\nThis is a CONTINUATION of an ongoing conversation. Resolve pronouns and references using the conversation history."
    : "";
  const historyBlock = history && history.length > 0
    ? "\n\nCONVERSATION HISTORY:\n" + history.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n")
    : "";

  return [
    {
      role: "system",
      content: `You are a query analysis assistant. Given a user's question and the wiki index, determine which wiki pages are relevant.${historyNote}

Return a JSON object:
{
  "intent": "what the user is asking about",
  "relevantTopics": ["topic strings to search for"],
  "pageSlugs": ["slugs of existing pages that are relevant"]
}

Be generous — include pages that might be tangentially relevant.
${JSON_INSTRUCTION}`,
    },
    {
      role: "user",
      content: `QUESTION: ${question}${historyBlock}\n\nWIKI INDEX:\n${indexContent}`,
    },
  ];
}

/**
 * Streaming version of synthesizeAnswerPrompt.
 * Returns raw markdown with [[wiki-links]] — no JSON wrapper.
 * Citations are extracted from the text after streaming completes.
 */
export function synthesizeAnswerStreamPrompt(
  question: string,
  wikiPages: Array<{ slug: string; title: string; content: string }>,
  history?: ChatMessage[]
): LLMMessage[] {
  const context = wikiPages
    .map((p) => `--- ${p.title} (${p.slug}) ---\n${p.content}`)
    .join("\n\n");

  const pageSlugs = wikiPages.map((p) => p.slug).join(", ");

  const messages: LLMMessage[] = [
    {
      role: "system",
      content: `You are a knowledge assistant. Answer the user's question based on the provided wiki pages.

Rules:
- Cite your sources using [[wiki-link]] format, e.g., "As noted in [[circadian-rhythm]]..."
- If the wiki contains contradictory information, mention both sides
- If the wiki doesn't contain enough information to fully answer, say so
- Be thorough but concise
- Use markdown formatting (headings, lists, bold, code, etc.)
- Available wiki pages to cite: ${pageSlugs}${history && history.length > 0 ? "\n- This is a continuation of a conversation. Use context from previous messages." : ""}

Output ONLY your answer in raw markdown. Do NOT wrap it in JSON or code fences.`,
    },
  ];

  if (history && history.length > 0) {
    const recent = history.slice(-10);
    for (const msg of recent) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }

  messages.push({
    role: "user",
    content: `QUESTION: ${question}\n\nWIKI PAGES:\n${context || "(no relevant pages found)"}`,
  });

  return messages;
}

export function synthesizeAnswerPrompt(
  question: string,
  wikiPages: Array<{ slug: string; title: string; content: string }>,
  history?: ChatMessage[]
): LLMMessage[] {
  const context = wikiPages
    .map((p) => `--- ${p.title} (${p.slug}) ---\n${p.content}`)
    .join("\n\n");

  const messages: LLMMessage[] = [
    {
      role: "system",
      content: `You are a knowledge assistant. Answer the user's question based on the provided wiki pages.

Rules:
- Cite your sources using [[wiki-link]] format, e.g., "As noted in [[circadian-rhythm]]..."
- If the wiki contains contradictory information, mention both sides
- If the wiki doesn't contain enough information to fully answer, say so
- Be thorough but concise
- Use markdown formatting${history && history.length > 0 ? "\n- This is a continuation of a conversation. Use context from previous messages." : ""}

Return a JSON object:
{
  "answer": "your full answer with [[wiki-link]] citations",
  "citations": ["list of page slugs cited"],
  "suggestedTitle": "optional title if this answer is worth saving as a wiki page, null if not",
  "suggestedCategory": "concepts" | "entities" | "sources" | "topics" | null
}
${JSON_INSTRUCTION}`,
    },
  ];

  // Inject conversation history as native multi-turn messages
  if (history && history.length > 0) {
    const recent = history.slice(-10);
    for (const msg of recent) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }

  // Current question with wiki context
  messages.push({
    role: "user",
    content: `QUESTION: ${question}\n\nWIKI PAGES:\n${context || "(no relevant pages found)"}`,
  });

  return messages;
}

// ============================================================
// LINT PIPELINE PROMPTS
// ============================================================

export function lintWikiPrompt(
  allPages: Array<{ slug: string; title: string; category: string; content: string; wikiLinks: string[] }>,
  indexContent: string
): LLMMessage[] {
  const pagesSummary = allPages
    .map((p) => `- [[${p.slug}]] (${p.category}): ${p.content.substring(0, 200).replace(/\n/g, " ")}... [links to: ${p.wikiLinks.join(", ") || "none"}]`)
    .join("\n");

  return [
    {
      role: "system",
      content: `You are a wiki quality auditor. Analyze the wiki for health issues.

Check for:
1. **Orphan pages** — pages with no inbound links from other wiki pages
2. **Broken links** — [[wiki-links]] that point to non-existent pages
3. **Contradictions** — conflicting claims between pages
4. **Thin pages** — pages with very little content that need enrichment
5. **Missing pages** — concepts/entities mentioned across multiple pages that don't have their own page
6. **Stale claims** — information that seems outdated

Return a JSON object:
{
  "orphanPages": ["slugs of orphaned pages"],
  "brokenLinks": [{ "fromPage": "slug", "targetSlug": "missing-slug" }],
  "contradictions": [{ "existingPage": "slug", "existingClaim": "...", "newClaim": "...", "severity": "high|medium|low", "recommendation": "..." }],
  "thinPages": ["slugs of pages with insufficient content"],
  "missingPages": ["suggested slugs for pages that should be created"],
  "staleClaims": [{ "page": "slug", "claim": "...", "reason": "why it seems stale" }],
  "suggestions": ["actionable improvement suggestions"],
  "overallHealth": "good" | "fair" | "poor"
}
${JSON_INSTRUCTION}`,
    },
    {
      role: "user",
      content: `WIKI INDEX:\n${indexContent}\n\nALL PAGES:\n${pagesSummary}`,
    },
  ];
}

// ============================================================
// UTILITY
// ============================================================

export const GENERIC_SYSTEM_PROMPT = `You are a helpful knowledge assistant. You help users understand and explore their personal knowledge wiki. Be concise, accurate, and reference wiki pages when relevant using [[wiki-link]] format.`;
