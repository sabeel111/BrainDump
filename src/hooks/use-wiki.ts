import { useState, useEffect, useCallback } from "react";
import type { WikiPage, WikiPageCategory } from "@/types";

export function useWiki() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPages = useCallback(async (category?: WikiPageCategory) => {
    setLoading(true);
    try {
      const params = category ? `?category=${category}` : "";
      const res = await fetch(`/api/wiki${params}`);
      if (!res.ok) throw new Error("Failed to fetch wiki pages");
      const data = await res.json();
      setPages(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wiki");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPage = useCallback(async (slug: string): Promise<WikiPage | null> => {
    try {
      const res = await fetch(`/api/wiki?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch page");
      }
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  return { pages, loading, error, refetch: fetchPages, fetchPage };
}
