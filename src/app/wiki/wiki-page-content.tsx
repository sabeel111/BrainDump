"use client";

import { useState, useMemo } from "react";
import { useWiki } from "@/hooks/use-wiki";
import { WikiPageList } from "@/components/wiki/wiki-page-list";
import { WikiSearch } from "@/components/wiki/wiki-search";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageSkeleton } from "@/components/shared/loading";
import { cn } from "@/lib/utils";

export function WikiPageContent() {
  const { pages, loading } = useWiki();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const filteredPages = useMemo(() => {
    let result = pages;
    if (activeTab !== "all") {
      result = result.filter((p) => p.category === activeTab);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.slug.includes(query) ||
          p.content.toLowerCase().includes(query) ||
          p.frontmatter.tags.some((t) => t.toLowerCase().includes(query))
      );
    }
    return result;
  }, [pages, activeTab, searchQuery]);

  if (loading) return <div className="p-6"><PageSkeleton /></div>;

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <WikiSearch onSearch={setSearchQuery} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({pages.length})</TabsTrigger>
          <TabsTrigger value="concepts">Concepts ({pages.filter((p) => p.category === "concepts").length})</TabsTrigger>
          <TabsTrigger value="entities">Entities ({pages.filter((p) => p.category === "entities").length})</TabsTrigger>
          <TabsTrigger value="sources">Sources ({pages.filter((p) => p.category === "sources").length})</TabsTrigger>
          <TabsTrigger value="topics">Topics ({pages.filter((p) => p.category === "topics").length})</TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab} className="mt-4">
          <WikiPageList pages={filteredPages} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
