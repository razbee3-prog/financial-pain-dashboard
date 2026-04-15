"use client";

import { useEffect, useState } from "react";
import { CATEGORY_COLORS } from "@/lib/utils";
import { ArrowUp, ExternalLink } from "lucide-react";

interface Quote {
  rawQuote: string;
  category: string;
  subreddit: string;
  permalink: string | null;
  upvotes: number;
  severity: string;
}

export default function TopQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    fetch("/api/top-quotes")
      .then((r) => r.json())
      .then((d) => setQuotes(d.quotes));
  }, []);

  if (!quotes.length) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {quotes.map((q, i) => {
        const source =
          q.subreddit === "x/twitter" ? "x.com" : `r/${q.subreddit}`;
        const url =
          q.subreddit === "x/twitter"
            ? q.permalink || "#"
            : `https://reddit.com${q.permalink}`;

        return (
          <div
            key={i}
            className="border-l-2 pl-4 py-2"
            style={{ borderLeftColor: CATEGORY_COLORS[q.category] || "#71717a" }}
          >
            <p className="text-sm text-foreground leading-snug">
              &ldquo;{q.rawQuote}&rdquo;
            </p>
            <div className="flex items-center gap-2 mt-2 text-[10px] text-muted">
              <span
                className="px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: `${CATEGORY_COLORS[q.category] || "#71717a"}18`,
                  color: CATEGORY_COLORS[q.category] || "#71717a",
                }}
              >
                {q.category}
              </span>
              <span className="flex items-center gap-0.5 tabular-nums">
                <ArrowUp size={9} />{q.upvotes}
              </span>
              <span>{source}</span>
              {q.permalink && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent transition-colors"
                  style={{ transition: "var(--transition)" }}
                >
                  <ExternalLink size={9} />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
