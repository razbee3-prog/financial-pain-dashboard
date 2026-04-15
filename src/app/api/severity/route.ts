import { NextResponse } from "next/server";
import { getAllPosts } from "@/lib/data";

export async function GET() {
  const posts = getAllPosts();
  const matrix: Record<string, Record<string, number>> = {};

  for (const p of posts) {
    if (!matrix[p.category]) {
      matrix[p.category] = { low: 0, medium: 0, high: 0, critical: 0 };
    }
    matrix[p.category][p.severity] =
      (matrix[p.category][p.severity] || 0) + 1;
  }

  return NextResponse.json({ matrix });
}
