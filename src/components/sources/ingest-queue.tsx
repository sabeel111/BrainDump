"use client";

import { useQueue } from "@/hooks/use-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  RefreshCw,
  X,
  Trash2,
} from "lucide-react";

export function IngestQueue() {
  const { status, retry, cancel, clearHistory } = useQueue(1000);

  if (!status) return null;

  const { jobs, isProcessing } = status;

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No ingestion jobs yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isProcessing && (
            <Badge variant="secondary">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Processing
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {jobs.filter((j) => j.status === "completed").length} completed ·{" "}
            {jobs.filter((j) => j.status === "failed").length} failed
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={clearHistory}>
          <Trash2 className="mr-1 h-3 w-3" />
          Clear history
        </Button>
      </div>

      <div className="space-y-2">
        {jobs.map((job) => (
          <Card key={job.id}>
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                {/* Status icon */}
                <div className="mt-0.5">
                  {job.status === "completed" && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                  {job.status === "processing" && (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  )}
                  {job.status === "queued" && (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  {job.status === "failed" && (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                </div>

                {/* Job details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{job.sourceName}</p>
                    <Badge variant="outline" className="text-xs">
                      {job.status}
                    </Badge>
                  </div>

                  {job.status === "processing" && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-1">
                        Step {(job.currentStep || 0) + 1}/{job.totalSteps}: {job.stepDescription}
                      </p>
                      <Progress
                        value={
                          job.totalSteps
                            ? ((job.currentStep || 0) / job.totalSteps) * 100
                            : 0
                        }
                        className="h-1.5"
                      />
                    </div>
                  )}

                  {job.status === "completed" && job.result && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {job.result.pagesCreated.length} pages · Updated{" "}
                      {job.result.pagesUpdated.length}
                      {job.result.contradictionsFound > 0 &&
                        ` · ${job.result.contradictionsFound} contradiction(s)`}
                    </p>
                  )}

                  {job.status === "failed" && job.error && (
                    <p className="text-xs text-destructive mt-1">{job.error}</p>
                  )}

                  {job.status === "queued" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Waiting for current job to finish...
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {job.status === "failed" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => retry(job.id)}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  )}
                  {job.status === "queued" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => cancel(job.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
