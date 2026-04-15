import { NextRequest, NextResponse } from "next/server";
import { getAllPosts, toPainPoint } from "@/lib/data";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const category = searchParams.get("category");
  const severity = searchParams.get("severity");
  const subreddit = searchParams.get("subreddit");
  const sort = searchParams.get("sort") || "date";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  let posts = getAllPosts();

  if (category) posts = posts.filter((p) => p.category === category);
  if (severity) posts = posts.filter((p) => p.severity === severity);
  if (subreddit) posts = posts.filter((p) => p.subreddit === subreddit);

  const sevOrder: Record<string, number> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  };

  if (sort === "upvotes") {
    posts.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
  } else if (sort === "severity") {
    posts.sort(
      (a, b) => (sevOrder[a.severity] || 5) - (sevOrder[b.severity] || 5)
    );
  } else {
    posts.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const total = posts.length;
  const start = (page - 1) * limit;
  const paginated = posts.slice(start, start + limit);

  return NextResponse.json({
    data: paginated.map(toPainPoint),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
