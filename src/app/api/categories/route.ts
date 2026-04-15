import { NextResponse } from "next/server";
import { getAllPosts } from "@/lib/data";

export async function GET() {
  const posts = getAllPosts();
  const total = posts.length;

  const counts: Record<string, number> = {};
  for (const p of posts) {
    counts[p.category] = (counts[p.category] || 0) + 1;
  }

  // Delta: last 7 days vs previous 7 days
  const now = Date.now();
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const d14 = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  const currCounts: Record<string, number> = {};
  const prevCounts: Record<string, number> = {};

  for (const p of posts) {
    if (p.created_at >= d7) {
      currCounts[p.category] = (currCounts[p.category] || 0) + 1;
    } else if (p.created_at >= d14) {
      prevCounts[p.category] = (prevCounts[p.category] || 0) + 1;
    }
  }

  const categories = Object.entries(counts)
    .map(([category, count]) => {
      const curr = currCounts[category] || 0;
      const prev = prevCounts[category] || 0;
      const delta = prev > 0
        ? Math.round(((curr - prev) / prev) * 100)
        : curr > 0 ? 100 : 0;
      return {
        category,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        delta,
      };
    })
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ categories, total });
}
