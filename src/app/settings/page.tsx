import { Header } from "@/components/layout/header";
import { SettingsContent } from "./settings-content";

export default function SettingsPage() {
  return (
    <>
      <Header />
      <div className="flex-1 overflow-y-auto">
        <SettingsContent />
      </div>
    </>
  );
}
