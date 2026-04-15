"use client";

import { ArrowUp, MessageSquare, ExternalLink } from "lucide-react";
import { CATEGORY_COLORS, SEVERITY_COLORS } from "@/lib/utils";
import type { FrontendPainPoint as PainPoint } from "@/lib/data";

interface Props {
  point: PainPoint;
}

export default function PainCard({ point }: Props) {
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "now";
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const source =
    point.subreddit === "x/twitter" ? "x.com" : `r/${point.subreddit}`;
  const sourceUrl =
    point.subreddit === "x/twitter"
      ? point.permalink || "#"
      : `https://reddit.com${point.permalink}`;

  const sevColor = SEVERITY_COLORS[point.severity] || "#71717a";

  return (
    <div
      className="group border-l-2 pl-4 py-3 hover:bg-[var(--hover)] transition-colors rounded-r-lg"
      style={{
        borderLeftColor: sevColor,
        transition: "var(--transition)",
      }}
    >
      {/* Quote */}
      {point.rawQuote && (
        <p className="text-sm text-foreground leading-snug">
          &ldquo;{point.rawQuote}&rdquo;
        </p>
      )}

      {/* Summary */}
      {point.painSummary && (
        <p className="text-xs text-muted mt-1 leading-relaxed">
          {point.painSummary}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-2 text-[11px] text-muted">
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{
            backgroundColor: `${CATEGORY_COLORS[point.category] || "#71717a"}18`,
            color: CATEGORY_COLORS[point.category] || "#71717a",
          }}
        >
          {point.category}
        </span>
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
          style={{
            backgroundColor: `${sevColor}18`,
            color: sevColor,
          }}
        >
          {point.severity}
        </span>
        <span className="text-muted">{source}</span>
        <span className="flex items-center gap-0.5 tabular-nums">
          <ArrowUp size={10} />{point.upvotes}
        </span>
        <span className="flex items-center gap-0.5 tabular-nums">
          <MessageSquare size={10} />{point.commentCount}
        </span>
        <span className="tabular-nums">{timeAgo(point.createdAt)}</span>
        {point.permalink && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-0.5 hover:text-accent transition-opacity"
            style={{ transition: "var(--transition)" }}
          >
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}
