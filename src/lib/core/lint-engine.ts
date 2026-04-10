/**
 * Lint engine — health-checks the wiki.
 */

import { createProvider } from "../llm/provider";
import { loadSettings } from "../config/settings";
import { listWikiPages } from "./wiki-engine";
import { readVaultFile } from "./vault";
import { appendLog } from "./log-manager";
import { lintWikiPrompt } from "../llm/prompts";
import type { LintReport } from "@/types";

/**
 * Run a full lint check on the wiki.
 */
export async function runLint(): Promise<LintReport> {
  const config = await loadSettings();
  const provider = createProvider(config);

  // Gather all wiki pages
  const allPages = await listWikiPages();
  const indexContent = await readVaultFile("index.md").catch(() => "");

  if (allPages.length === 0) {
    return {
      orphanPages: [],
      brokenLinks: [],
      contradictions: [],
      thinPages: [],
      missingPages: [],
      staleClaims: [],
      suggestions: ["The wiki is empty. Start by ingesting some sources!"],
      overallHealth: "good",
    };
  }

  // Call LLM for analysis
  const pagesData = allPages.map((p) => ({
    slug: p.slug,
    title: p.title,
    category: p.frontmatter.category,
    content: p.content,
    wikiLinks: p.wikiLinks,
  }));

  const response = await provider.complete({
    messages: lintWikiPrompt(pagesData, indexContent),
    temperature: 0.2,
    maxTokens: config.maxTokens * 2,
  });

  let report: LintReport;
  try {
    let jsonStr = response.content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    report = JSON.parse(jsonStr) as LintReport;
  } catch {
    report = {
      orphanPages: [],
      brokenLinks: [],
      contradictions: [],
      thinPages: [],
      missingPages: [],
      staleClaims: [],
      suggestions: ["Unable to parse lint results. The wiki may need manual review."],
      overallHealth: "fair",
    };
  }

  // Log the lint
  await appendLog(
    "lint",
    "Wiki Health Check",
    `Lint complete. Health: ${report.overallHealth}. ${report.suggestions.length} suggestions.`,
    [],
    []
  );

  return report;
}
