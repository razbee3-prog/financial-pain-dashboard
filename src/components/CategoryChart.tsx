"use client";

import { useEffect, useState } from "react";
import { CATEGORY_COLORS, SEVERITY_COLORS } from "@/lib/utils";
import { ChevronDown, TrendingUp, TrendingDown } from "lucide-react";

interface CategoryData {
  category: string;
  count: number;
  percentage: number;
  delta: number;
}

interface Props {
  onCategoryClick?: (category: string | null) => void;
  selectedCategory?: string | null;
}

function getHighestSeverity(
  matrix: Record<string, number> | undefined
): string {
  if (!matrix) return "low";
  for (const level of ["critical", "high", "medium", "low"] as const) {
    if ((matrix[level] || 0) > 0) return level;
  }
  return "low";
}

export default function CategoryChart({
  onCategoryClick,
  selectedCategory,
}: Props) {
  const [data, setData] = useState<CategoryData[]>([]);
  const [severityData, setSeverityData] = useState<
    Record<string, Record<string, number>>
  >({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/severity").then((r) => r.json()),
    ]).then(([catData, sevData]) => {
      setData(catData.categories);
      setSeverityData(sevData.matrix);
    });
  }, []);

  if (!data.length) {
    return (
      <div className="bg-card border border-card-border rounded-lg animate-pulse h-80" />
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const visibleData = expanded ? data : data.slice(0, 6);

  return (
    <div className="bg-card border border-card-border rounded-lg p-4 h-full">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold">Categories</h2>
        <span className="text-xs text-muted">{data.length} total</span>
      </div>

      {/* Inline bar rows — no recharts, pure CSS for control */}
      <div className="space-y-1.5">
        {visibleData.map((d) => {
          const pct = (d.count / maxCount) * 100;
          const highSev = getHighestSeverity(severityData[d.category]);
          const isSelected = selectedCategory === d.category;

          return (
            <button
              key={d.category}
              onClick={() =>
                onCategoryClick?.(isSelected ? null : d.category)
              }
              className={`w-full group flex items-center gap-3 px-2 py-1.5 rounded text-left transition-colors ${
                isSelected
                  ? "bg-[var(--hover-strong)]"
                  : "hover:bg-[var(--hover)]"
              }`}
              style={{ transition: "var(--transition)" }}
            >
              {/* Bar + label */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground truncate">
                    {d.category}
                  </span>
                  <span className="text-xs text-muted tabular-nums ml-2">
                    {d.count}
                  </span>
                </div>
                <div className="h-1.5 bg-[var(--hover)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor:
                        CATEGORY_COLORS[d.category] || "#71717a",
                      opacity: isSelected ? 1 : 0.7,
                      transition: "var(--transition)",
                    }}
                  />
                </div>
              </div>

              {/* Severity pill */}
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize shrink-0 w-14 text-center"
                style={{
                  backgroundColor: `${SEVERITY_COLORS[highSev]}18`,
                  color: SEVERITY_COLORS[highSev],
                }}
              >
                {highSev}
              </span>

              {/* Delta */}
              <span
                className={`text-[10px] tabular-nums shrink-0 w-10 text-right flex items-center justify-end gap-0.5 ${
                  d.delta > 0 ? "text-red-400" : d.delta < 0 ? "text-emerald-400" : "text-muted"
                }`}
              >
                {d.delta > 0 ? (
                  <TrendingUp size={9} />
                ) : d.delta < 0 ? (
                  <TrendingDown size={9} />
                ) : null}
                {d.delta !== 0 ? `${Math.abs(d.delta)}%` : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expand toggle */}
      {data.length > 6 && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-xs text-muted hover:text-foreground mt-3 px-2 transition-colors"
          style={{ transition: "var(--transition)" }}
        >
          {expanded ? "Show less" : `Show all ${data.length}`}
          <ChevronDown
            size={12}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}
