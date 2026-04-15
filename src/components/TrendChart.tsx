"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CATEGORY_COLORS, CATEGORIES } from "@/lib/utils";

interface TrendEntry {
  date: string;
  [category: string]: string | number;
}

export default function TrendChart() {
  const [data, setData] = useState<TrendEntry[]>([]);
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set(CATEGORIES)
  );

  useEffect(() => {
    fetch("/api/trends")
      .then((r) => r.json())
      .then((d) => setData(d.trends));
  }, []);

  if (!data.length) {
    return (
      <div className="bg-card border border-card-border rounded-lg animate-pulse h-80" />
    );
  }

  const toggleCategory = (cat: string) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const fmt = (d: unknown) => {
    if (typeof d !== "string") return "";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="bg-card border border-card-border rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold">Trends</h2>
        <span className="text-xs text-muted">30d</span>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              {CATEGORIES.map((cat) => (
                <linearGradient
                  key={cat}
                  id={`g-${cat.replace(/\s+/g, "-")}`}
                  x1="0" y1="0" x2="0" y2="1"
                >
                  <stop offset="0%" stopColor={CATEGORY_COLORS[cat]} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={CATEGORY_COLORS[cat]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={fmt}
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={24}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "var(--foreground)",
                boxShadow: "var(--shadow-md)",
              }}
              labelFormatter={fmt}
            />
            {CATEGORIES.filter((cat) => visibleCategories.has(cat)).map((cat) => (
              <Area
                key={cat}
                type="monotone"
                dataKey={cat}
                stroke={CATEGORY_COLORS[cat]}
                strokeWidth={1.5}
                fill={`url(#g-${cat.replace(/\s+/g, "-")})`}
                dot={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — compact pills */}
      <div className="flex flex-wrap gap-1 mt-3">
        {CATEGORIES.map((cat) => {
          const active = visibleCategories.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className="text-[10px] px-1.5 py-0.5 rounded transition-opacity"
              style={{
                backgroundColor: active ? `${CATEGORY_COLORS[cat]}20` : "transparent",
                color: active ? CATEGORY_COLORS[cat] : "#52525b",
                opacity: active ? 1 : 0.5,
                transition: "var(--transition)",
              }}
            >
              {cat.length > 16 ? cat.slice(0, 16) + "…" : cat}
            </button>
          );
        })}
      </div>
    </div>
  );
}
