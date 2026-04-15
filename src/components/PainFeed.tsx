"use client";

import { useEffect, useState, useCallback } from "react";
import PainCard from "./PainCard";
import Filters from "./Filters";
import type { FrontendPainPoint as PainPoint } from "@/lib/data";

interface Props {
  externalCategory?: string | null;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function PainFeed({ externalCategory }: Props) {
  const [data, setData] = useState<PainPoint[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [subreddit, setSubreddit] = useState("");
  const [sort, setSort] = useState("date");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (externalCategory !== undefined) {
      setCategory(externalCategory || "");
      setPage(1);
    }
  }, [externalCategory]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (severity) params.set("severity", severity);
    if (subreddit) params.set("subreddit", subreddit);
    params.set("sort", sort);
    params.set("page", String(page));

    fetch(`/api/pain-points?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.data);
        setPagination(d.pagination);
      })
      .finally(() => setLoading(false));
  }, [category, severity, subreddit, sort, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Feed</h2>
          <span className="text-xs text-muted tabular-nums">{pagination.total}</span>
        </div>
        <Filters
          category={category}
          severity={severity}
          subreddit={subreddit}
          sort={sort}
          onCategoryChange={(v) => { setCategory(v); setPage(1); }}
          onSeverityChange={(v) => { setSeverity(v); setPage(1); }}
          onSubredditChange={(v) => { setSubreddit(v); setPage(1); }}
          onSortChange={(v) => { setSort(v); setPage(1); }}
        />
      </div>

      {/* Cards */}
      <div className="bg-card border border-card-border rounded-lg divide-y divide-card-border">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted">Loading...</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">No results</div>
        ) : (
          data.map((point) => (
            <PainCard key={point.id} point={point} />
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-muted">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="tabular-nums">{page} / {pagination.totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages}
            className="hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
