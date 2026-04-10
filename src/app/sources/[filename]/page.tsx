import { Header } from "@/components/layout/header";
import { SourceDetailContent } from "./source-detail-content";

interface PageProps {
  params: Promise<{ filename: string }>;
}

export default async function SourceDetailPage({ params }: PageProps) {
  const { filename } = await params;
  return (
    <>
      <Header />
      <div className="flex-1 overflow-y-auto p-6">
        <SourceDetailContent filename={filename} />
      </div>
    </>
  );
}
