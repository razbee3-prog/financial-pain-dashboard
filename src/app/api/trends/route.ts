import { NextResponse } from "next/server";
import { getAllPosts } from "@/lib/data";

export async function GET() {
  const posts = getAllPosts();
  const cutoff = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const dateMap: Record<string, Record<string, number>> = {};

  for (const p of posts) {
    if (p.created_at < cutoff) continue;
    const date = p.created_at.split("T")[0];
    if (!dateMap[date]) dateMap[date] = {};
    dateMap[date][p.category] = (dateMap[date][p.category] || 0) + 1;
  }

  const trends = Object.entries(dateMap)
    .map(([date, cats]) => ({ date, ...cats }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ trends });
}
