"use client";

import { ThemeToggle } from "./theme-toggle";
import { SearchBar } from "@/components/shared/search-bar";

export function Header() {
  return (
    <header className="flex justify-between items-center w-full px-8 py-4 sticky top-0 z-30 bg-[var(--color-surface)]/80 backdrop-blur-xl transition-theme">
      {/* Search */}
      <SearchBar />

      {/* Right side */}
      <div className="flex items-center gap-6">
        <ThemeToggle />
      </div>
    </header>
  );
}
