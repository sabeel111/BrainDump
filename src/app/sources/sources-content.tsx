"use client";

import { useSources } from "@/hooks/use-sources";
import { SourceUploader } from "@/components/sources/source-uploader";
import { SourceList } from "@/components/sources/source-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageSkeleton } from "@/components/shared/loading";
import { IngestQueue } from "@/components/sources/ingest-queue";

export function SourcesContent() {
  const { sources, loading, refetch } = useSources();

  if (loading) return <div className="p-6"><PageSkeleton /></div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="sources">
            Sources ({sources.length})
          </TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-4">
          <SourceUploader onUploaded={() => refetch()} />
        </TabsContent>

        <TabsContent value="sources" className="mt-4">
          <SourceList sources={sources} />
        </TabsContent>

        <TabsContent value="queue" className="mt-4">
          <IngestQueue />
        </TabsContent>
      </Tabs>
    </div>
  );
}
