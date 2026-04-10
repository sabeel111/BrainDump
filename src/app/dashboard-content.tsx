"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  FileText,
  Lightbulb,
  Database,
  Activity,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Upload,
  Plus,
  MessageSquare,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useQueue } from "@/hooks/use-queue";

interface VaultStats {
  totalPages: number;
  totalSources: number;
  categories: Record<string, number>;
}

export function DashboardContent() {
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { status: queueStatus } = useQueue();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sources");
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      } catch {
        // vault not initialized yet
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-10 space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-[var(--color-surface-container)] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const totalPages = stats?.totalPages || 0;
  const totalSources = stats?.totalSources || 0;
  const concepts = stats?.categories?.concepts || 0;
  const entities = stats?.categories?.entities || 0;

  return (
    <div className="p-10 space-y-12">
      {/* Dashboard Header */}
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <p className="text-[var(--color-on-tertiary-fixed-variant)] font-bold tracking-[0.2em] text-[10px] uppercase">
            Knowledge Overview
          </p>
          <h2 className="text-4xl font-extrabold text-[var(--color-primary)] tracking-tighter">
            Curation Dashboard
          </h2>
        </div>
      </div>

      {/* Metrics Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Total Pages */}
        <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-xl ambient-shadow flex flex-col justify-between h-40">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-primary-fixed)]/30 flex items-center justify-center">
              <FileText className="h-5 w-5 text-[var(--color-primary)]" />
            </div>
            <span className="text-xs font-bold text-[var(--color-on-tertiary-fixed-variant)] bg-[var(--color-tertiary-fixed)]/40 px-2 py-1 rounded">
              Wiki
            </span>
          </div>
          <div>
            <p className="text-5xl font-black text-[var(--color-primary)] tracking-tighter">
              {totalPages.toLocaleString()}
            </p>
            <p className="text-xs text-[var(--color-foreground-muted)] font-medium">Total Wiki Pages</p>
          </div>
        </div>

        {/* Sources */}
        <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-xl ambient-shadow flex flex-col justify-between h-40">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-secondary-container)]/30 flex items-center justify-center">
            <Upload className="h-5 w-5 text-[var(--color-secondary)]" />
          </div>
          <div>
            <p className="text-5xl font-black text-[var(--color-primary)] tracking-tighter">
              {totalSources}
            </p>
            <p className="text-xs text-[var(--color-foreground-muted)] font-medium">Active Sources</p>
          </div>
        </div>

        {/* Concepts */}
        <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-xl ambient-shadow flex flex-col justify-between h-40">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-primary-fixed)]/30 flex items-center justify-center">
            <Lightbulb className="h-5 w-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <p className="text-5xl font-black text-[var(--color-primary)] tracking-tighter">
              {concepts}
            </p>
            <p className="text-xs text-[var(--color-foreground-muted)] font-medium">Key Concepts</p>
          </div>
        </div>

        {/* Entities */}
        <div className="bg-[var(--color-surface-container-lowest)] p-6 rounded-xl ambient-shadow flex flex-col justify-between h-40 border-l-4 border-[var(--color-tertiary-fixed)]">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-tertiary-fixed)]/30 flex items-center justify-center">
            <Database className="h-5 w-5 text-[var(--color-tertiary)]" />
          </div>
          <div>
            <p className="text-5xl font-black text-[var(--color-primary)] tracking-tighter">
              {entities}
            </p>
            <p className="text-xs text-[var(--color-foreground-muted)] font-medium">Total Entities</p>
          </div>
        </div>
      </div>

      {/* Ingestion Queue & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Ingestion Queue (spans 2) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--color-primary)] tracking-tight">
              Ingestion Queue
            </h3>
            <Link href="/sources" className="text-xs font-bold text-[var(--color-on-tertiary-fixed-variant)] hover:underline transition-all">
              View all history
            </Link>
          </div>

          <div className="bg-[var(--color-surface-container-low)] rounded-xl overflow-hidden">
            {queueStatus && queueStatus.jobs.length > 0 ? (
              queueStatus.jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between px-8 py-6 bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container-low)] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[var(--color-surface-container-high)] flex items-center justify-center">
                      {job.status === "completed" && <CheckCircle2 className="h-5 w-5 text-[var(--color-success)]" />}
                      {job.status === "processing" && <Loader2 className="h-5 w-5 animate-spin text-[var(--color-info)]" />}
                      {job.status === "queued" && <Clock className="h-5 w-5 text-[var(--color-foreground-muted)]" />}
                      {job.status === "failed" && <AlertCircle className="h-5 w-5 text-[var(--color-destructive)]" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[var(--color-primary)]">{job.sourceName}</h4>
                      {job.status === "processing" && (
                        <>
                          <p className="text-[10px] text-[var(--color-foreground-muted)] uppercase tracking-wider">
                            Step {(job.currentStep || 0) + 1}/{job.totalSteps}: {job.stepDescription}
                          </p>
                          <Progress
                            value={job.totalSteps ? ((job.currentStep || 0) / job.totalSteps) * 100 : 0}
                            className="mt-1.5 h-1"
                          />
                        </>
                      )}
                      {job.status === "completed" && job.result && (
                        <p className="text-[10px] text-[var(--color-foreground-muted)]">
                          Created {job.result.pagesCreated.length} pages · Updated {job.result.pagesUpdated.length}
                          {job.result.contradictionsFound > 0 && ` · ${job.result.contradictionsFound} contradiction(s)`}
                        </p>
                      )}
                      {job.status === "failed" && job.error && (
                        <p className="text-[10px] text-[var(--color-destructive)]">{job.error}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right mr-2">
                      <p className="text-xs font-bold text-[var(--color-on-surface)]">
                        {job.status === "processing" ? "Processing" : job.status === "completed" ? "Done" : job.status === "failed" ? "Failed" : "Queued"}
                      </p>
                    </div>
                    {job.status === "processing" ? (
                      <div className="flex items-center gap-2 px-3 py-1 bg-[var(--color-tertiary-fixed)]/20 text-[var(--color-on-tertiary-fixed-variant)] rounded-full text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-on-tertiary-fixed-variant)] animate-pulse" />
                        INGESTING
                      </div>
                    ) : (
                      <Badge
                        variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}
                        className="text-[10px] font-bold"
                      >
                        {job.status.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-16 text-center">
                <Upload className="h-10 w-10 mx-auto mb-3 text-[var(--color-foreground-muted)] opacity-40" />
                <p className="text-sm text-[var(--color-foreground-muted)]">
                  No ingestion jobs yet. Upload sources to get started.
                </p>
                <Link href="/sources">
                  <Button
                    size="sm"
                    className="mt-4 premium-gradient text-[var(--color-on-primary)] hover:opacity-90 transition-opacity"
                  >
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    Upload Sources
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions (spans 1) */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-[var(--color-primary)] tracking-tight">
            Quick Actions
          </h3>

          <div className="space-y-4">
            <Link href="/sources">
              <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-xl ambient-shadow hover:bg-[var(--color-surface-container-low)] cursor-pointer transition-all border-l-4 border-transparent hover:border-[var(--color-primary-fixed)]">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg premium-gradient flex items-center justify-center text-[var(--color-on-primary)]">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--color-primary)]">Ingest Source</h4>
                    <p className="text-xs text-[var(--color-foreground-muted)]">PDF, Web, or paste text</p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/chat">
              <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-xl ambient-shadow hover:bg-[var(--color-surface-container-low)] cursor-pointer transition-all border-l-4 border-transparent hover:border-[var(--color-primary-fixed)]">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-surface-container-high)] flex items-center justify-center text-[var(--color-foreground-muted)]">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--color-primary)]">Query Wiki</h4>
                    <p className="text-xs text-[var(--color-foreground-muted)]">Ask AI about your data</p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/wiki">
              <div className="p-4 bg-[var(--color-surface-container-lowest)] rounded-xl ambient-shadow hover:bg-[var(--color-surface-container-low)] cursor-pointer transition-all border-l-4 border-transparent hover:border-[var(--color-primary-fixed)]">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-surface-container-high)] flex items-center justify-center text-[var(--color-foreground-muted)]">
                    <Search className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--color-primary)]">Browse Wiki</h4>
                    <p className="text-xs text-[var(--color-foreground-muted)]">Explore the hierarchy</p>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Editorial Highlight Banner */}
      <div className="relative rounded-2xl overflow-hidden h-56 bg-[var(--color-primary)] flex items-center">
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.4) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative z-10 px-12 space-y-4 max-w-2xl">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--color-tertiary-fixed)]">
            Editorial Note
          </span>
          <h3 className="text-3xl font-bold text-white tracking-tighter leading-tight">
            &ldquo;Knowledge is not just data, but the connection between its fragments.&rdquo;
          </h3>
          <p className="text-[var(--color-primary-fixed)] text-sm font-medium">
            BrainDump has synthesized {totalPages} pages from {totalSources} sources.{" "}
            {totalPages > 0 && (
              <Link href="/wiki" className="underline underline-offset-2 hover:text-white transition-colors">
                Explore the archive →
              </Link>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
