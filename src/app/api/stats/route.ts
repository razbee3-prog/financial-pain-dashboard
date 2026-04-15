import { NextResponse } from "next/server";
import { getAllPosts } from "@/lib/data";

export async function GET() {
  const posts = getAllPosts();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString();

  const todayPosts = posts.filter((p) => p.scraped_at >= todayStr);
  const xPosts = posts.filter((p) => p.subreddit === "x/twitter");
  const redditPosts = posts.filter((p) => p.subreddit !== "x/twitter");
  const todayX = todayPosts.filter((p) => p.subreddit === "x/twitter");
  const todayReddit = todayPosts.filter((p) => p.subreddit !== "x/twitter");

  // Top category today
  const todayCatCounts: Record<string, number> = {};
  for (const p of todayPosts) {
    todayCatCounts[p.category] = (todayCatCounts[p.category] || 0) + 1;
  }
  const topCatEntry = Object.entries(todayCatCounts).sort(
    (a, b) => b[1] - a[1]
  )[0];

  // Avg severity
  const sevMap: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  const totalSev = posts.reduce((s, p) => s + (sevMap[p.severity] || 0), 0);
  const avgSev = posts.length > 0 ? totalSev / posts.length : 0;
  const avgSevLabel =
    avgSev <= 1.5
      ? "low"
      : avgSev <= 2.5
        ? "medium"
        : avgSev <= 3.5
          ? "high"
          : "critical";

  const lastScraped = posts
    .map((p) => p.scraped_at)
    .sort()
    .reverse()[0] || null;

  return NextResponse.json({
    totalComplaints: posts.length,
    todayComplaints: todayPosts.length,
    xCount: xPosts.length,
    redditCount: redditPosts.length,
    todayXCount: todayX.length,
    todayRedditCount: todayReddit.length,
    topCategory: topCatEntry
      ? {
          name: topCatEntry[0],
          count: topCatEntry[1],
          percentage:
            todayPosts.length > 0
              ? Math.round((topCatEntry[1] / todayPosts.length) * 100)
              : 0,
        }
      : null,
    avgSeverity: avgSevLabel,
    avgSeverityScore: Math.round(avgSev * 10) / 10,
    lastScraped,
  });
}
