import { Header } from "@/components/layout/header";
import { DevContent } from "./dev-content";

export default function DevPage() {
  return (
    <>
      <Header />
      <div className="flex-1 overflow-y-auto">
        <DevContent />
      </div>
    </>
  );
}
