"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { CATEGORY_COLORS, SEVERITY_COLORS } from "@/lib/utils";
import PainCard from "./PainCard";
import type { FrontendPainPoint as PainPoint } from "@/lib/data";

interface Cluster {
  subcategory: string;
  category: string;
  severity: string;
  count: number;
  bestQuote: string | null;
  posts: PainPoint[];
}

interface Props {
  cluster: Cluster;
}

export default function ClusterCard({ cluster }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full text-left px-4 py-3 hover:bg-[var(--hover)] transition-colors flex items-start gap-3"
        style={{ transition: "var(--transition)" }}
      >
        <ChevronRight
          size={14}
          className={`mt-0.5 text-muted shrink-0 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />

        <div className="flex-1 min-w-0">
          {/* Best quote as headline */}
          {cluster.bestQuote && (
            <p className="text-sm text-foreground leading-snug truncate">
              &ldquo;{cluster.bestQuote}&rdquo;
            </p>
          )}

          {/* Cluster meta */}
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted">
            <span
              className="px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: `${CATEGORY_COLORS[cluster.category] || "#71717a"}18`,
                color: CATEGORY_COLORS[cluster.category] || "#71717a",
              }}
            >
              {cluster.subcategory}
            </span>
            <span
              className="px-1.5 py-0.5 rounded font-medium capitalize"
              style={{
                backgroundColor: `${SEVERITY_COLORS[cluster.severity]}18`,
                color: SEVERITY_COLORS[cluster.severity],
              }}
            >
              {cluster.severity}
            </span>
            <span className="tabular-nums">
              {cluster.count} post{cluster.count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </button>

      {/* Expanded: individual posts */}
      {expanded && (
        <div className="ml-7 border-l border-card-border">
          {cluster.posts.map((post) => (
            <PainCard key={post.id} point={post} />
          ))}
        </div>
      )}
    </div>
  );
}
