/**
 * Source document types for the Knowledge Wiki application.
 */

export interface SourceDocument {
  filename: string;       // filename in vault/raw/
  name: string;           // display name (without extension)
  content: string;        // file content
  size: number;           // file size in bytes
  addedAt: string;        // ISO date when added
  processed: boolean;     // has this been ingested?
  filePath: string;       // relative path from vault root
}

export interface SourceUploadInput {
  filename: string;
  content: string;
}

export type SourceUploadMethod = "file" | "paste" | "url";
