/**
 * Query engine — handles user questions against the wiki.
 * Supports true token-by-token streaming for ChatGPT-like UX.
 */

import { createProvider } from "../llm/provider";
import { loadSettings } from "../config/settings";
import { readIndex, findRelatedPages } from "./index-manager";
import { readWikiPage, createWikiPage } from "./wiki-engine";
import { readVaultFile } from "./vault";
import {
  analyzeQueryPrompt,
  synthesizeAnswerStreamPrompt,
} from "../llm/prompts";
import type { QueryAnswer, QueryAnalysis } from "@/types";
import type { ChatMessage } from "@/types/chat";

export type QueryStreamChunk =
  | { type: "thinking"; content: string }
  | { type: "stream"; content: string }          // incremental token
  | { type: "answer"; content: string; answer: QueryAnswer }  // final complete answer
  | { type: "done" }
  | { type: "error"; content: string };

/**
 * Process a user query against the wiki.
 * Streams tokens from the LLM in real-time.
 */
export async function* processQuery(
  question: string,
  history?: ChatMessage[]
): AsyncGenerator<QueryStreamChunk> {
  try {
    const config = await loadSettings();
    const provider = createProvider(config);

    // Step 1: Analyze the question (non-streaming — fast)
    yield { type: "thinking", content: "Analyzing your question..." };

    const indexContent = await readVaultFile("index.md").catch(() => "");
    const analysisResponse = await provider.complete({
      messages: analyzeQueryPrompt(question, indexContent, history),
      temperature: 0.1,
    });

    let analysis: QueryAnalysis;
    try {
      let jsonStr = analysisResponse.content.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1].trim();
      analysis = JSON.parse(jsonStr) as QueryAnalysis;
    } catch {
      analysis = {
        intent: question,
        relevantTopics: question.split(/\s+/),
        pageSlugs: [],
      };
    }

    // Step 2: Find and read relevant pages
    yield { type: "thinking", content: "Searching wiki for relevant pages..." };

    const relatedEntries = await findRelatedPages(analysis.relevantTopics);
    const allSlugs = [
      ...new Set([...analysis.pageSlugs, ...relatedEntries.map((e) => e.slug)]),
    ];

    const wikiPages: Array<{ slug: string; title: string; content: string }> =
      [];
    for (const slug of allSlugs) {
      const page = await readWikiPage(slug);
      if (page) {
        wikiPages.push({
          slug: page.slug,
          title: page.title,
          content: page.content,
        });
      }
    }

    if (wikiPages.length === 0) {
      const noAnswer =
        "I couldn't find any relevant wiki pages for your question. Try ingesting some sources first, or rephrase your question.";
      yield {
        type: "answer",
        content: noAnswer,
        answer: {
          answer: noAnswer,
          citations: [],
        },
      };
      yield { type: "done" };
      return;
    }

    // Step 3: Stream the answer token by token
    yield {
      type: "thinking",
      content: `Found ${wikiPages.length} relevant pages. Generating answer...`,
    };

    let fullContent = "";

    const streamPrompt = synthesizeAnswerStreamPrompt(
      question,
      wikiPages,
      history
    );

    for await (const chunk of provider.stream({
      messages: streamPrompt,
      temperature: 0.3,
    })) {
      if (chunk.type === "text" && chunk.content) {
        fullContent += chunk.content;
        yield { type: "stream", content: chunk.content };
      } else if (chunk.type === "error") {
        yield {
          type: "error",
          content: chunk.error || "Streaming error",
        };
        return;
      }
    }

    // Extract citations from [[wiki-links]] in the generated text
    const citations = extractCitations(fullContent, wikiPages);

    const answer: QueryAnswer = {
      answer: fullContent,
      citations,
    };

    // Send the final complete answer so the client can persist it
    yield { type: "answer", content: fullContent, answer };
    yield { type: "done" };
  } catch (error) {
    yield {
      type: "error",
      content:
        error instanceof Error
          ? error.message
          : "An error occurred processing your query",
    };
  }
}

/**
 * Extract cited page slugs from [[wiki-links]] in text.
 * Only includes slugs that match actual wiki pages provided as context.
 */
function extractCitations(
  text: string,
  wikiPages: Array<{ slug: string }>
): string[] {
  const knownSlugs = new Set(wikiPages.map((p) => p.slug));
  const matches = text.matchAll(/\[\[([^\]]+)\]\]/g);
  const citations = new Set<string>();

  for (const match of matches) {
    const slug = match[1].trim().toLowerCase().replace(/\s+/g, "-");
    if (knownSlugs.has(slug)) {
      citations.add(slug);
    }
  }

  return Array.from(citations);
}

/**
 * Save a chat answer as a new wiki page.
 */
export async function saveAnswerAsPage(
  title: string,
  content: string,
  category: "concepts" | "entities" | "sources" | "topics" = "topics",
  tags: string[] = []
): Promise<string> {
  const page = await createWikiPage({
    title,
    category,
    content,
    tags,
  });
  return page.slug;
}
