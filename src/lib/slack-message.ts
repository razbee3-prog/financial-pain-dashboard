import { getAllPosts, getLatestDigest, type PainPoint } from "./data";

// Slack Block Kit types (minimal — just what we use)
type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string } }
  | { type: "divider" }
  | {
      type: "section";
      text?: { type: "mrkdwn"; text: string };
      fields?: Array<{ type: "mrkdwn"; text: string }>;
    }
  | {
      type: "context";
      elements: Array<{ type: "mrkdwn"; text: string }>;
    };

const SEV_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const SEV_EMOJI: Record<string, string> = {
  critical: "🟥",
  high: "🟧",
  medium: "🟨",
  low: "🟩",
};

const SEV_WEIGHT: Record<string, number> = {
  critical: 4.0,
  high: 2.5,
  medium: 1.5,
  low: 1.0,
};

const MIN_ENGAGEMENT = 10;

function daysSince(iso: string): number {
  if (!iso) return 9999;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / 86_400_000;
}

function scorePost(p: PainPoint): number {
  const base = (p.upvotes || 0) + (p.comment_count || 0);
  const sev = SEV_WEIGHT[p.severity] ?? 1.0;
  const recency = Math.pow(0.5, daysSince(p.created_at) / 7); // 7-day half-life
  return base * sev * recency;
}

/**
 * Pick 5 posts that are:
 *   - fresh (scraped in last 7 days; fallback 14d, then any)
 *   - high-engagement (>= MIN_ENGAGEMENT)
 *   - score-ranked (engagement × severity × recency)
 *   - category-diverse (max 1 per category)
 */
function pickTop5Fresh(posts: PainPoint[]): PainPoint[] {
  const hasQuote = (p: PainPoint) => !!p.raw_quote;
  const passesFloor = (p: PainPoint) =>
    (p.upvotes || 0) + (p.comment_count || 0) >= MIN_ENGAGEMENT;

  const inWindow = (days: number) =>
    posts.filter(
      (p) => hasQuote(p) && passesFloor(p) && daysSince(p.scraped_at) <= days
    );

  let candidates = inWindow(7);
  if (candidates.length < 5) candidates = inWindow(14);
  if (candidates.length < 5)
    candidates = posts.filter((p) => hasQuote(p) && passesFloor(p));

  const sorted = candidates.sort((a, b) => scorePost(b) - scorePost(a));

  const seen: Record<string, number> = {};
  const picks: PainPoint[] = [];
  for (const p of sorted) {
    const cat = p.category || "";
    if ((seen[cat] || 0) >= 1) continue;
    picks.push(p);
    seen[cat] = (seen[cat] || 0) + 1;
    if (picks.length >= 5) break;
  }
  return picks;
}

function highestSeverity(posts: PainPoint[]): string {
  let best = "low";
  for (const p of posts) {
    if ((SEV_ORDER[p.severity] || 0) > (SEV_ORDER[best] || 0)) best = p.severity;
  }
  return best;
}

function postUrl(p: PainPoint): string {
  if (p.subreddit === "x/twitter") return p.permalink || "#";
  return `https://reddit.com${p.permalink || ""}`;
}

function sourceLabel(p: PainPoint): string {
  return p.subreddit === "x/twitter" ? "x.com" : `r/${p.subreddit}`;
}

/** Slack's mrkdwn escapes: &, <, > need encoding */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildSlackMessage(dashboardUrl: string): {
  blocks: SlackBlock[];
  text: string;
} {
  const posts = getAllPosts();
  const xCount = posts.filter((p) => p.subreddit === "x/twitter").length;
  const redditCount = posts.length - xCount;

  // Category rollup
  const catBuckets: Record<string, PainPoint[]> = {};
  for (const p of posts) {
    if (!catBuckets[p.category]) catBuckets[p.category] = [];
    catBuckets[p.category].push(p);
  }
  const categoryRows = Object.entries(catBuckets)
    .map(([cat, ps]) => ({
      name: cat,
      count: ps.length,
      pct: Math.round((ps.length / posts.length) * 100),
      severity: highestSeverity(ps),
    }))
    .sort((a, b) => b.count - a.count);

  const topCat = categoryRows[0];

  // Top 5 — fresh, severity-weighted, diversified
  const top5 = pickTop5Fresh(posts);

  const digest = getLatestDigest();
  const takeaways: string[] = digest ? JSON.parse(digest.content) : [];

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Pain Pulse — Weekly Summary` },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${today}_ · <${dashboardUrl}|View dashboard>` }],
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Total complaints*\n${posts.length}  _(${redditCount} reddit · ${xCount} x)_` },
        {
          type: "mrkdwn",
          text: `*Top category*\n${topCat ? esc(topCat.name) : "—"}${topCat ? `  _(${topCat.count} · ${topCat.pct}%)_` : ""}`,
        },
      ],
    },
  ];

  if (takeaways.length) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🎯 3 recommended features*\n${takeaways
          .slice(0, 3)
          .map((t, i) => `${i + 1}. ${esc(t)}`)
          .join("\n")}`,
      },
    });
  }

  if (top5.length) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🔥 Top 5 posts by engagement*` },
    });
    for (const p of top5) {
      const sev = SEV_EMOJI[p.severity] || "⬜";
      const quote = esc(p.raw_quote || "").slice(0, 280);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${sev} _"${quote}"_\n*${esc(p.category)}*  ·  ↑${p.upvotes || 0}  ·  💬${p.comment_count || 0}  ·  <${postUrl(p)}|${sourceLabel(p)}>`,
        },
      });
    }
  }

  // Category breakdown — compact mrkdwn "table"
  blocks.push({ type: "divider" });
  const catLines = categoryRows
    .slice(0, 10)
    .map(
      (r) =>
        `${SEV_EMOJI[r.severity] || "⬜"} *${esc(r.name)}*  —  ${r.count} (${r.pct}%)`
    )
    .join("\n");
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*📊 Category breakdown*\n${catLines}` },
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Pain Pulse · auto-generated · <${dashboardUrl}|Open dashboard>`,
      },
    ],
  });

  const fallbackText = `Pain Pulse weekly summary — ${posts.length} total complaints, top category: ${topCat?.name || "N/A"}`;
  return { blocks, text: fallbackText };
}
