"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Search, X, FileText, Loader2 } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

interface SearchResult {
  slug: string;
  title: string;
  category: string;
  snippet: string;
  score: number;
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(async (value: string) => {
    if (!value.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setIsOpen(true);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, 300);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      debouncedSearch(value);
    },
    [debouncedSearch]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const categoryIcons: Record<string, string> = {
    concepts: "💡",
    entities: "🏷️",
    sources: "📄",
    topics: "📚",
  };

  return (
    <div ref={wrapperRef} className="flex-1 max-w-md relative">
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[var(--color-foreground-muted)] transition-colors group-focus-within:text-[#fbe0a3]" />
        <input
          ref={inputRef}
          className="w-full bg-[var(--color-surface-container-highest)] border-none rounded-xl pl-10 pr-10 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-muted)] focus:ring-1 focus:ring-[#fbe0a3]/40 focus:bg-[var(--color-surface-container-lowest)] transition-all outline-none"
          placeholder="Search wiki pages... (⌘K)"
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-foreground-muted)]" />}
          {query && !loading && (
            <button
              onClick={handleClear}
              className="text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground-secondary)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Results Dropdown */}
      {isOpen && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50 max-h-[400px] overflow-y-auto
          bg-[var(--color-surface-container-lowest)]/95 backdrop-blur-2xl border border-[var(--color-outline-variant)]/30 shadow-[0_8px_32px_rgba(9,20,38,0.25)]">
          {results.length === 0 && !loading && (
            <div className="px-4 py-6 text-center text-sm text-[var(--color-foreground-muted)]">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {results.map((result) => (
            <Link
              key={result.slug}
              href={`/wiki/${result.slug}`}
              onClick={() => {
                setIsOpen(false);
                setQuery("");
              }}
              className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--color-surface-container-high)] transition-colors border-b border-[var(--color-outline-variant)]/20 last:border-b-0"
            >
              <span className="text-sm mt-0.5 flex-shrink-0">
                {categoryIcons[result.category] || "📝"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--color-foreground)] truncate">
                  {result.title}
                </div>
                <div className="text-xs text-[var(--color-foreground-muted)] mt-0.5 line-clamp-2">
                  {result.snippet}
                </div>
              </div>
              <span className="text-[10px] text-[var(--color-foreground-muted)] uppercase tracking-wide flex-shrink-0 mt-1 bg-[var(--color-surface-container-highest)] px-1.5 py-0.5 rounded">
                {result.category}
              </span>
            </Link>
          ))}

          {results.length > 0 && (
            <div className="px-4 py-2 text-[10px] text-[var(--color-foreground-muted)] border-t border-[var(--color-outline-variant)]/20">
              {results.length} result{results.length !== 1 ? "s" : ""} found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
