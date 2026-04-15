"use client";

import { useEffect, useState } from "react";
import { SEVERITY_COLORS } from "@/lib/utils";

interface Stats {
  totalComplaints: number;
  todayComplaints: number;
  xCount: number;
  redditCount: number;
  todayXCount: number;
  todayRedditCount: number;
  topCategory: { name: string; count: number; percentage: number } | null;
  avgSeverity: string;
  avgSeverityScore: number;
  lastScraped: string | null;
}

export default function MetricCards() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-card-border rounded-lg animate-pulse h-20" />
        ))}
      </div>
    );
  }

  const metrics = [
    { label: "Total", value: stats.totalComplaints, sub: `${stats.redditCount} reddit · ${stats.xCount} x` },
    { label: "Today", value: stats.todayComplaints, sub: `${stats.todayRedditCount} reddit · ${stats.todayXCount} x` },
    {
      label: "Top category",
      value: stats.topCategory?.name || "—",
      sub: stats.topCategory ? `${stats.topCategory.percentage}%` : "",
      isText: true,
    },
    {
      label: "Severity",
      value: stats.avgSeverity,
      sub: `${stats.avgSeverityScore}/4`,
      color: SEVERITY_COLORS[stats.avgSeverity],
      isText: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="bg-card border border-card-border rounded-lg px-4 py-3"
        >
          <p className="text-xs text-muted">{m.label}</p>
          <p
            className={`${m.isText ? "text-lg" : "text-3xl"} font-semibold tracking-tight mt-1 truncate`}
            style={m.color ? { color: m.color } : undefined}
          >
            {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
          </p>
          {m.sub && (
            <p className="text-xs text-muted mt-0.5">{m.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
