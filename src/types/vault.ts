/**
 * Vault structure types for the Knowledge Wiki application.
 */

export interface VaultConfig {
  vaultPath: string;
  rawDir: string;
  wikiDir: string;
  indexFile: string;
  logFile: string;
  schemaFile: string;
}

export interface VaultStats {
  totalPages: number;
  totalSources: number;
  processedSources: number;
  categories: Record<string, number>;
  recentActivity: LogEntry[];
}

export interface LogEntry {
  timestamp: string;
  type: "ingest" | "query" | "lint";
  title: string;
  details: string;
  pagesCreated: string[];
  pagesUpdated: string[];
}

export interface IngestJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  sourceFile: string;
  sourceName: string;
  addedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
  result?: IngestResult;
  currentStep?: number;
  totalSteps?: number;
  stepDescription?: string;
}

export interface IngestResult {
  pagesCreated: string[];
  pagesUpdated: string[];
  contradictionsFound: number;
  warnings: string[];
}

export interface QueueStatus {
  jobs: IngestJob[];
  currentJob: IngestJob | null;
  totalQueued: number;
  totalCompleted: number;
  totalFailed: number;
  isProcessing: boolean;
}
