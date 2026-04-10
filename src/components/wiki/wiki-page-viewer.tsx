"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { slugify } from "@/lib/markdown/parser";

interface WikiPageViewerProps {
  content: string;
}

/**
 * Renders wiki markdown content with [[wiki-links]] as clickable links.
 */
export function WikiPageViewer({ content }: WikiPageViewerProps) {
  // Pre-process wiki-links to standard markdown links
  const processed = content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target, label) => {
      const slug = slugify(target.trim());
      const displayText = label || target.trim();
      return `[${displayText}](/wiki/${slug})`;
    }
  );

  return (
    <div className="wiki-content prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("/wiki/")) {
              return (
                <Link href={href} className="wiki-link">
                  {children}
                </Link>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
