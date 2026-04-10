/**
 * Wiki page types for the Knowledge Wiki application.
 */

export type WikiPageCategory = "concepts" | "entities" | "sources" | "topics";

export interface WikiPageFrontmatter {
  title: string;
  category: WikiPageCategory;
  created: string;       // ISO date
  updated: string;       // ISO date
  tags: string[];
  sourceCount: number;
  sources: string[];     // references to raw source files
  related: string[];     // wiki-links to related pages
}

export interface WikiPage {
  slug: string;          // filename without extension, used as ID
  title: string;
  category: WikiPageCategory;
  frontmatter: WikiPageFrontmatter;
  content: string;       // raw markdown body (without frontmatter)
  rawContent: string;    // full file content including frontmatter
  wikiLinks: string[];   // extracted [[wiki-links]] found in content
  backLinks: string[];   // pages that link TO this page (computed)
  filePath: string;      // relative path from vault root
}

export interface WikiPageIndex {
  categories: Record<WikiPageCategory, WikiPageSummary[]>;
  totalPages: number;
  lastUpdated: string;
}

export interface WikiPageSummary {
  slug: string;
  title: string;
  category: WikiPageCategory;
  summary: string;       // one-line description
  tags: string[];
  sourceCount: number;
  updated: string;
  filePath: string;
}

export interface WikiPageCreateInput {
  title: string;
  category: WikiPageCategory;
  content: string;
  tags?: string[];
  sources?: string[];
  related?: string[];
}

export interface WikiPageUpdateInput {
  content?: string;
  tags?: string[];
  sources?: string[];
  related?: string[];
  appendContent?: string;  // append to existing content
}
