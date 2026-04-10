"use client";

import { useEffect, useState } from "react";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { toast } from "react-hot-toast";

export function SourceDetailContent({ filename }: { filename: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sources?filename=${encodeURIComponent(filename)}`);
        if (res.ok) {
          const data = await res.json();
          setContent(data.content);
        }
      } catch {
        // source not found
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filename]);

  const handleIngest = async () => {
    setIngesting(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFile: `raw/${filename}`,
          sourceName: filename,
        }),
      });
      if (!res.ok) throw new Error("Failed to queue");
      toast.success(`${filename} queued for ingestion`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to ingest");
    } finally {
      setIngesting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">Source not found</p>
        <Link href="/sources">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sources
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <Breadcrumb
        items={[
          { label: "Sources", href: "/sources" },
          { label: filename },
        ]}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{filename}</h2>
        <Button onClick={handleIngest} disabled={ingesting}>
          {ingesting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Queuing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Ingest
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed overflow-x-auto">
            {content}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
