import { NextResponse } from "next/server";
import { getAllPosts } from "@/lib/data";

export async function GET() {
  const posts = getAllPosts()
    .filter((p) => p.raw_quote)
    .sort(
      (a, b) =>
        (b.upvotes || 0) + (b.comment_count || 0) -
        ((a.upvotes || 0) + (a.comment_count || 0))
    )
    .slice(0, 3)
    .map((p) => ({
      rawQuote: p.raw_quote,
      category: p.category,
      subreddit: p.subreddit,
      permalink: p.permalink,
      upvotes: p.upvotes,
      severity: p.severity,
    }));

  return NextResponse.json({ quotes: posts });
}
