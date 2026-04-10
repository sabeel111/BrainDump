import { Header } from "@/components/layout/header";
import { WikiDetailContent } from "./wiki-detail-content";

export default async function WikiDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <Header />
      <div className="flex-1 overflow-y-auto">
        <WikiDetailContent slug={slug} />
      </div>
    </>
  );
}
