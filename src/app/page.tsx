import { Header } from "@/components/layout/header";
import { DashboardContent } from "./dashboard-content";

export default function HomePage() {
  return (
    <>
      <Header />
      <div className="flex-1 overflow-y-auto">
        <DashboardContent />
      </div>
    </>
  );
}
