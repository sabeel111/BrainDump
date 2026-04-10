"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { WikiPageViewer } from "@/components/wiki/wiki-page-viewer";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Clock, Tag, Link as LinkIcon, ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import type { WikiPage } from "@/types";

export function WikiDetailContent({ slug }: { slug: string }) {
  const [page, setPage] = useState<WikiPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/wiki?slug=${encodeURIComponent(slug)}`);
        if (res.ok) {
          const data = await res.json();
          setPage(data);
        }
      } catch {
        // page not found
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="h-10 w-96 bg-muted rounded animate-pulse" />
        <div className="space-y-2">
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileText className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Page not found</p>
        <p className="text-sm mb-4">The wiki page &quot;{slug}&quot; doesn&apos;t exist yet.</p>
        <Link href="/wiki">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Wiki
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Breadcrumb
        items={[
          { label: "Wiki", href: "/wiki" },
          { label: page.title },
        ]}
      />

      {/* Page header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Badge variant="secondary">{page.category}</Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Updated {new Date(page.frontmatter.updated).toLocaleDateString()}
          </span>
          <span className="text-xs text-muted-foreground">
            {page.frontmatter.sourceCount} source(s)
          </span>
        </div>
      </div>

      {/* Page content */}
      <Card>
        <CardContent className="p-6">
          <WikiPageViewer content={page.content} />
        </CardContent>
      </Card>

      {/* Tags */}
      {page.frontmatter.tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          {page.frontmatter.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Back-links */}
      {page.backLinks.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <LinkIcon className="h-3.5 w-3.5" />
              Linked from ({page.backLinks.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {page.backLinks.map((slug) => (
                <Link key={slug} href={`/wiki/${slug}`}>
                  <Badge variant="outline" className="hover:bg-accent cursor-pointer">
                    [[{slug}]]
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Outgoing links */}
      {page.wikiLinks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <LinkIcon className="h-3.5 w-3.5" />
            Links to ({page.wikiLinks.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {page.wikiLinks.map((slug) => (
              <Link key={slug} href={`/wiki/${slug}`}>
                <Badge variant="outline" className="hover:bg-accent cursor-pointer">
                  [[{slug}]]
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
