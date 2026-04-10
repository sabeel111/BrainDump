import { Header } from "@/components/layout/header";
import { WikiPageContent } from "./wiki-page-content";

export default function WikiListPage() {
  return (
    <>
      <Header />
      <div className="flex-1 overflow-y-auto">
        <WikiPageContent />
      </div>
    </>
  );
}
