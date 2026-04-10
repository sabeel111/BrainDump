"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BookOpen, User, Lightbulb, FileText } from "lucide-react";
import type { WikiPage, WikiPageCategory } from "@/types";

const categoryIcons: Record<WikiPageCategory, React.ComponentType<{ className?: string }>> = {
  concepts: Lightbulb,
  entities: User,
  sources: FileText,
  topics: BookOpen,
};

const categoryColors: Record<WikiPageCategory, string> = {
  concepts: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  entities: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  sources: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  topics: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

interface WikiPageListProps {
  pages: WikiPage[];
}

export function WikiPageList({ pages }: WikiPageListProps) {
  if (pages.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">No wiki pages yet</p>
        <p className="text-sm">Start by ingesting a source to build your wiki.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {pages.map((page) => {
        const Icon = categoryIcons[page.category];
        const colorClass = categoryColors[page.category];

        return (
          <Link key={page.slug} href={`/wiki/${page.slug}`}>
            <Card className="hover:border-primary/30 transition-colors cursor-pointer">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-medium truncate">
                      {page.title}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5 truncate">
                      {page.content.substring(0, 120).replace(/[#*_\[\]]/g, "")}...
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className={colorClass}>
                    {page.category}
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
