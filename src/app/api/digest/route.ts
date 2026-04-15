import { NextResponse } from "next/server";
import { getLatestDigest } from "@/lib/data";

export async function GET() {
  const digest = getLatestDigest();

  if (!digest) {
    return NextResponse.json({ digest: null });
  }

  return NextResponse.json({
    digest: {
      takeaways: JSON.parse(digest.content),
      generatedAt: digest.generated_at,
      periodStart: digest.period_start,
      periodEnd: digest.period_end,
    },
  });
}
