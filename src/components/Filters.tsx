"use client";

import { CATEGORIES, SEVERITIES, SUBREDDITS } from "@/lib/utils";

interface Props {
  category: string;
  severity: string;
  subreddit: string;
  sort: string;
  onCategoryChange: (v: string) => void;
  onSeverityChange: (v: string) => void;
  onSubredditChange: (v: string) => void;
  onSortChange: (v: string) => void;
}

export default function Filters({
  category,
  severity,
  subreddit,
  sort,
  onCategoryChange,
  onSeverityChange,
  onSubredditChange,
  onSortChange,
}: Props) {
  const cls =
    "bg-transparent border border-card-border rounded h-7 px-2 text-xs text-muted appearance-none cursor-pointer hover:border-gray-500 hover:text-foreground focus:outline-none focus:border-accent transition-colors";

  return (
    <div className="flex flex-wrap gap-1.5">
      <select value={category} onChange={(e) => onCategoryChange(e.target.value)} className={cls} style={{ transition: "var(--transition)" }}>
        <option value="">Category</option>
        {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
      </select>
      <select value={severity} onChange={(e) => onSeverityChange(e.target.value)} className={cls} style={{ transition: "var(--transition)" }}>
        <option value="">Severity</option>
        {SEVERITIES.map((s) => (<option key={s} value={s}>{s}</option>))}
      </select>
      <select value={subreddit} onChange={(e) => onSubredditChange(e.target.value)} className={cls} style={{ transition: "var(--transition)" }}>
        <option value="">Source</option>
        {SUBREDDITS.map((s) => (<option key={s} value={s}>{s === "x/twitter" ? "X" : `r/${s}`}</option>))}
      </select>
      <select value={sort} onChange={(e) => onSortChange(e.target.value)} className={cls} style={{ transition: "var(--transition)" }}>
        <option value="date">Newest</option>
        <option value="upvotes">Upvoted</option>
        <option value="severity">Severity</option>
      </select>
    </div>
  );
}
