import data from "./data.json";

export interface PainPoint {
  id: string;
  reddit_post_id: string;
  subreddit: string;
  title: string;
  body: string | null;
  raw_quote: string | null;
  pain_summary: string | null;
  category: string;
  subcategory: string | null;
  severity: string;
  sentiment: string | null;
  confidence: number | null;
  upvotes: number;
  comment_count: number;
  permalink: string | null;
  demographic_signal: string | null;
  created_at: string;
  scraped_at: string;
}

export interface Digest {
  id: string;
  content: string;
  generated_at: string;
  period_start: string;
  period_end: string;
}

export interface FrontendPainPoint {
  id: string;
  redditPostId: string;
  subreddit: string;
  title: string;
  body: string | null;
  rawQuote: string | null;
  painSummary: string | null;
  category: string;
  subcategory: string | null;
  severity: "low" | "medium" | "high" | "critical";
  sentiment: string | null;
  confidence: number | null;
  upvotes: number;
  commentCount: number;
  permalink: string | null;
  demographicSignal: string | null;
  createdAt: string;
  scrapedAt: string;
}

// Re-shape DB snake_case to camelCase to match frontend expectations
export function toPainPoint(r: PainPoint): FrontendPainPoint {
  return {
    id: r.id,
    redditPostId: r.reddit_post_id,
    subreddit: r.subreddit,
    title: r.title,
    body: r.body,
    rawQuote: r.raw_quote,
    painSummary: r.pain_summary,
    category: r.category,
    subcategory: r.subcategory,
    severity: r.severity as "low" | "medium" | "high" | "critical",
    sentiment: r.sentiment,
    confidence: r.confidence,
    upvotes: r.upvotes,
    commentCount: r.comment_count,
    permalink: r.permalink,
    demographicSignal: r.demographic_signal,
    createdAt: r.created_at,
    scrapedAt: r.scraped_at,
  };
}

export function getAllPosts(): PainPoint[] {
  return (data as { posts: PainPoint[] }).posts;
}

export function getLatestDigest(): Digest | null {
  const digests = (data as { digests: Digest[] }).digests;
  if (!digests.length) return null;
  return [...digests].sort((a, b) =>
    b.generated_at.localeCompare(a.generated_at)
  )[0];
}
