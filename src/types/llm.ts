/**
 * LLM provider types for the Knowledge Wiki application.
 */

export type LLMProviderType = "openai" | "anthropic" | "custom";

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  // Custom endpoint fields
  customBaseUrl?: string;
  customHeaders?: Record<string, string>;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMStreamChunk {
  type: "text" | "done" | "error";
  content?: string;
  error?: string;
}

// Structured outputs for ingest pipeline
export interface ExtractedTopics {
  topics: string[];
  entities: string[];
  concepts: string[];
  keyClaims: string[];
}

export interface PageAnalysis {
  contradictions: Contradiction[];
  newTopics: string[];
  newEntities: string[];
  updatesNeeded: string[];
  summary: string;
}

export interface Contradiction {
  existingPage: string;
  existingClaim: string;
  newClaim: string;
  severity: "high" | "medium" | "low";
  recommendation: string;
}

export interface PageGeneration {
  slug: string;
  title: string;
  category: "concepts" | "entities" | "sources" | "topics";
  content: string;
  tags: string[];
  isNew: boolean;
}

/** A planned page from the planning phase — title and scope, no content yet. */
export interface PagePlanEntry {
  slug: string;
  title: string;
  category: "concepts" | "entities" | "sources" | "topics";
  tags: string[];
  isNew: boolean;
  /** What this page should cover — guidance for the generation phase. */
  scope: string;
  /** Which sections of the source are most relevant (section indices). */
  relevantSections?: number[];
}

/** The full plan returned by the planning phase. */
export interface PagePlan {
  pages: PagePlanEntry[];
  summary: string;
  contradictions: Contradiction[];
}

// Structured output for query pipeline
export interface QueryAnalysis {
  intent: string;
  relevantTopics: string[];
  pageSlugs: string[];
}

export interface QueryAnswer {
  answer: string;
  citations: string[];
  suggestedTitle?: string;
  suggestedCategory?: "concepts" | "entities" | "sources" | "topics";
}

// Structured output for lint
export interface LintReport {
  orphanPages: string[];
  brokenLinks: BrokenLink[];
  contradictions: Contradiction[];
  thinPages: string[];
  missingPages: string[];
  staleClaims: StaleClaim[];
  suggestions: string[];
  overallHealth: "good" | "fair" | "poor";
}

export interface BrokenLink {
  fromPage: string;
  targetSlug: string;
}

export interface StaleClaim {
  page: string;
  claim: string;
  reason: string;
}
