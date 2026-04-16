import { getAllPosts, getLatestDigest, type PainPoint } from "./data";
import { CATEGORY_COLORS, SEVERITY_COLORS } from "./utils";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const SEV_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function highestSeverity(posts: PainPoint[]): string {
  let best = "low";
  for (const p of posts) {
    if ((SEV_ORDER[p.severity] || 0) > (SEV_ORDER[best] || 0)) {
      best = p.severity;
    }
  }
  return best;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function postUrl(p: PainPoint): string {
  if (p.subreddit === "x/twitter") return p.permalink || "#";
  return `https://reddit.com${p.permalink || ""}`;
}

function formatSource(p: PainPoint): string {
  return p.subreddit === "x/twitter" ? "x.com" : `r/${p.subreddit}`;
}

export function buildWeeklyEmail(dashboardUrl: string): EmailContent {
  const posts = getAllPosts();
  const xCount = posts.filter((p) => p.subreddit === "x/twitter").length;
  const redditCount = posts.length - xCount;

  // Category breakdown
  const catCounts: Record<string, PainPoint[]> = {};
  for (const p of posts) {
    if (!catCounts[p.category]) catCounts[p.category] = [];
    catCounts[p.category].push(p);
  }
  const categoryRows = Object.entries(catCounts)
    .map(([cat, ps]) => ({
      name: cat,
      count: ps.length,
      pct: Math.round((ps.length / posts.length) * 100),
      severity: highestSeverity(ps),
    }))
    .sort((a, b) => b.count - a.count);

  const topCat = categoryRows[0];

  // Top 5 posts by engagement (upvotes + comments)
  const top5 = [...posts]
    .filter((p) => p.raw_quote)
    .sort(
      (a, b) =>
        (b.upvotes || 0) +
        (b.comment_count || 0) -
        ((a.upvotes || 0) + (a.comment_count || 0))
    )
    .slice(0, 5);

  const digest = getLatestDigest();
  const takeaways: string[] = digest ? JSON.parse(digest.content) : [];

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const subject = `Pain Pulse — Weekly Summary (${new Date().toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" }
  )})`;

  // ── HTML ──
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b;line-height:1.5;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;padding:24px 0;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">

<!-- Header -->
<tr><td style="padding:32px 32px 16px 32px;border-bottom:1px solid #e4e4e7;">
<div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${escapeHtml(today)}</div>
<h1 style="margin:8px 0 4px 0;font-size:22px;font-weight:700;color:#09090b;letter-spacing:-0.4px;">Pain Pulse — Weekly Summary</h1>
<div style="font-size:13px;color:#71717a;">Financial pain point intelligence from Reddit and X/Twitter</div>
</td></tr>

<!-- Top metrics -->
<tr><td style="padding:24px 32px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
  <td valign="top" width="50%" style="padding-right:8px;">
    <div style="background:#f9fafb;border-radius:8px;padding:16px;border:1px solid #e4e4e7;">
      <div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Total complaints</div>
      <div style="font-size:28px;font-weight:700;color:#09090b;margin-top:4px;letter-spacing:-0.5px;">${posts.length}</div>
      <div style="font-size:12px;color:#71717a;margin-top:4px;">${redditCount} reddit · ${xCount} x</div>
    </div>
  </td>
  <td valign="top" width="50%" style="padding-left:8px;">
    <div style="background:#f9fafb;border-radius:8px;padding:16px;border:1px solid #e4e4e7;">
      <div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Top category</div>
      <div style="font-size:18px;font-weight:700;color:#09090b;margin-top:4px;letter-spacing:-0.3px;">${topCat ? escapeHtml(topCat.name) : "—"}</div>
      <div style="font-size:12px;color:#71717a;margin-top:4px;">${topCat ? `${topCat.count} posts · ${topCat.pct}%` : ""}</div>
    </div>
  </td>
</tr>
</table>
</td></tr>

<!-- Category breakdown -->
<tr><td style="padding:0 32px 24px 32px;">
<h2 style="font-size:14px;font-weight:600;color:#09090b;margin:0 0 12px 0;">Category breakdown</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<thead>
<tr>
  <th align="left" style="font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;padding:8px 0;border-bottom:1px solid #e4e4e7;">Category</th>
  <th align="right" style="font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;padding:8px 12px 8px 0;border-bottom:1px solid #e4e4e7;">Count</th>
  <th align="right" style="font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;padding:8px 12px 8px 0;border-bottom:1px solid #e4e4e7;">%</th>
  <th align="right" style="font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;padding:8px 0;border-bottom:1px solid #e4e4e7;">Top severity</th>
</tr>
</thead>
<tbody>
${categoryRows
  .map(
    (r) => `<tr>
  <td style="padding:8px 0;font-size:13px;color:#18181b;border-bottom:1px solid #f3f4f6;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${CATEGORY_COLORS[r.name] || "#71717a"};margin-right:8px;vertical-align:middle;"></span>${escapeHtml(r.name)}</td>
  <td align="right" style="padding:8px 12px 8px 0;font-size:13px;color:#18181b;border-bottom:1px solid #f3f4f6;font-variant-numeric:tabular-nums;">${r.count}</td>
  <td align="right" style="padding:8px 12px 8px 0;font-size:13px;color:#71717a;border-bottom:1px solid #f3f4f6;font-variant-numeric:tabular-nums;">${r.pct}%</td>
  <td align="right" style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="display:inline-block;font-size:11px;font-weight:600;text-transform:capitalize;background:${SEVERITY_COLORS[r.severity]}20;color:${SEVERITY_COLORS[r.severity]};padding:2px 8px;border-radius:4px;">${r.severity}</span></td>
</tr>`
  )
  .join("")}
</tbody>
</table>
</td></tr>

<!-- Top 5 posts -->
<tr><td style="padding:0 32px 24px 32px;">
<h2 style="font-size:14px;font-weight:600;color:#09090b;margin:0 0 12px 0;">Top 5 posts by engagement</h2>
${top5
  .map(
    (p) => `<div style="border-left:3px solid ${SEVERITY_COLORS[p.severity] || "#71717a"};padding:12px 16px;background:#f9fafb;border-radius:0 8px 8px 0;margin-bottom:12px;">
  <div style="font-size:14px;color:#18181b;font-style:normal;line-height:1.5;">"${escapeHtml(p.raw_quote || "")}"</div>
  <div style="font-size:11px;color:#71717a;margin-top:8px;">
    <span style="display:inline-block;font-weight:600;background:${CATEGORY_COLORS[p.category] || "#71717a"}20;color:${CATEGORY_COLORS[p.category] || "#71717a"};padding:2px 6px;border-radius:4px;margin-right:8px;">${escapeHtml(p.category)}</span>
    <span style="margin-right:8px;">↑ ${p.upvotes || 0}</span>
    <span style="margin-right:8px;">💬 ${p.comment_count || 0}</span>
    <a href="${escapeHtml(postUrl(p))}" style="color:#6366f1;text-decoration:none;">${escapeHtml(formatSource(p))} →</a>
  </div>
</div>`
  )
  .join("")}
</td></tr>

<!-- Recommendations -->
${
  takeaways.length
    ? `<tr><td style="padding:0 32px 24px 32px;">
<h2 style="font-size:14px;font-weight:600;color:#09090b;margin:0 0 12px 0;">3 recommended features</h2>
<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:16px;">
<ol style="margin:0;padding-left:24px;color:#18181b;">
${takeaways
  .slice(0, 3)
  .map(
    (t) => `<li style="font-size:13px;line-height:1.6;margin-bottom:8px;">${escapeHtml(t)}</li>`
  )
  .join("")}
</ol>
</div>
</td></tr>`
    : ""
}

<!-- CTA -->
<tr><td style="padding:0 32px 32px 32px;text-align:center;">
<a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;">View live dashboard →</a>
</td></tr>

<!-- Footer -->
<tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e4e4e7;text-align:center;">
<div style="font-size:11px;color:#71717a;">Pain Pulse · Auto-generated weekly summary · ${escapeHtml(today)}</div>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  // ── Plain text fallback ──
  const text = `PAIN PULSE — WEEKLY SUMMARY
${today}

TOTAL COMPLAINTS: ${posts.length} (${redditCount} reddit, ${xCount} x)
TOP CATEGORY: ${topCat?.name || "N/A"} (${topCat?.count || 0} posts, ${topCat?.pct || 0}%)

CATEGORY BREAKDOWN
${categoryRows
  .map(
    (r) => `  - ${r.name}: ${r.count} posts (${r.pct}%) — top severity: ${r.severity}`
  )
  .join("\n")}

TOP 5 POSTS BY ENGAGEMENT
${top5
  .map(
    (p, i) => `${i + 1}. "${p.raw_quote}"
   ${p.category} · ↑${p.upvotes} · 💬${p.comment_count} · ${formatSource(p)}
   ${postUrl(p)}`
  )
  .join("\n\n")}

${
  takeaways.length
    ? `3 RECOMMENDED FEATURES
${takeaways
  .slice(0, 3)
  .map((t, i) => `${i + 1}. ${t}`)
  .join("\n")}
`
    : ""
}

View live dashboard: ${dashboardUrl}
`;

  return { subject, html, text };
}
