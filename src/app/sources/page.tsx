import { Header } from "@/components/layout/header";
import { SourcesContent } from "./sources-content";

export default function SourcesPage() {
  return (
    <>
      <Header />
      <div className="flex-1 overflow-y-auto">
        <SourcesContent />
      </div>
    </>
  );
}
