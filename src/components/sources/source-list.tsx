"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Upload, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";

interface SourceInfo {
  filename: string;
  name: string;
  ingested?: boolean;
}

interface SourceListProps {
  sources: SourceInfo[];
}

export function SourceList({ sources }: SourceListProps) {
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [ingestingAll, setIngestingAll] = useState(false);

  const handleIngest = async (filename: string) => {
    setIngesting(filename);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFile: `raw/${filename}`,
          sourceName: filename,
        }),
      });

      if (!res.ok) throw new Error("Failed to queue ingestion");
      toast.success(`${filename} queued for ingestion`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to ingest");
    } finally {
      setIngesting(null);
    }
  };

  const handleIngestAll = async () => {
    setIngestingAll(true);
    try {
      // Only ingest sources that haven't been ingested yet
      const sourcesToIngest = sources
        .filter((s) => !s.ingested)
        .map((s) => ({
          file: `raw/${s.filename}`,
          name: s.filename,
        }));

      if (sourcesToIngest.length === 0) {
        toast("All sources have already been ingested");
        return;
      }

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: sourcesToIngest }),
      });

      if (!res.ok) throw new Error("Failed to queue ingestion");
      toast.success(`${sourcesToIngest.length} sources queued for ingestion`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to ingest");
    } finally {
      setIngestingAll(false);
    }
  };

  const newSources = sources.filter((s) => !s.ingested);
  const ingestedSources = sources.filter((s) => s.ingested);

  if (sources.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">No sources yet</p>
        <p className="text-sm">Upload files or paste text to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sources.length} source(s) · {newSources.length} new · {ingestedSources.length} ingested
        </p>
        <Button onClick={handleIngestAll} disabled={ingestingAll} size="sm">
          {ingestingAll ? (
            <>
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Queuing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-3 w-3" />
              Ingest New ({newSources.length})
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-2">
        {sources.map((source) => (
          <div
            key={source.filename}
            className={`flex items-center gap-3 rounded-lg border p-3 transition-colors
              ${source.ingested
                ? "border-[var(--surface-ghost)] bg-[var(--surface-1)]"
                : "border-[#fbe0a3]/20 bg-[var(--surface-2)]"
              }`}
          >
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={`/sources/${encodeURIComponent(source.filename)}`}
                  className="text-sm font-medium hover:underline truncate"
                >
                  {source.name}
                </Link>
                {source.ingested && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-0">
                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                    Ingested
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{source.filename}</p>
            </div>
            {source.ingested ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleIngest(source.filename)}
                disabled={ingesting === source.filename}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                {ingesting === source.filename ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    <span className="text-xs">Re-ingest</span>
                  </>
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleIngest(source.filename)}
                disabled={ingesting === source.filename}
                className="border-[#fbe0a3]/30 text-[#fbe0a3] hover:bg-[#fbe0a3]/10"
              >
                {ingesting === source.filename ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-3 w-3 mr-1" />
                    <span className="text-xs">Ingest</span>
                  </>
                )}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
