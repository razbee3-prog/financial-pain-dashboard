import { NextRequest, NextResponse } from "next/server";
import { getAllPosts, toPainPoint } from "@/lib/data";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get("category");
  const severity = searchParams.get("severity");
  const subreddit = searchParams.get("subreddit");

  let posts = getAllPosts();
  if (category) posts = posts.filter((p) => p.category === category);
  if (severity) posts = posts.filter((p) => p.severity === severity);
  if (subreddit) posts = posts.filter((p) => p.subreddit === subreddit);

  posts.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));

  const sevOrder: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  const clusterMap: Record<
    string,
    {
      subcategory: string;
      category: string;
      severity: string;
      count: number;
      bestQuote: string | null;
      bestUpvotes: number;
      posts: ReturnType<typeof toPainPoint>[];
    }
  > = {};

  for (const p of posts) {
    const key = p.subcategory || p.category;
    if (!clusterMap[key]) {
      clusterMap[key] = {
        subcategory: key,
        category: p.category,
        severity: p.severity,
        count: 0,
        bestQuote: null,
        bestUpvotes: 0,
        posts: [],
      };
    }
    const c = clusterMap[key];
    c.count++;
    c.posts.push(toPainPoint(p));

    if (sevOrder[p.severity] > (sevOrder[c.severity] || 0)) {
      c.severity = p.severity;
    }
    if (p.raw_quote && (p.upvotes || 0) > c.bestUpvotes) {
      c.bestQuote = p.raw_quote;
      c.bestUpvotes = p.upvotes || 0;
    }
  }

  const clusters = Object.values(clusterMap).sort((a, b) => b.count - a.count);
  return NextResponse.json({ clusters });
}
