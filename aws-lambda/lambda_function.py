"""
AWS Lambda handler for weekly Pain Pulse data refresh.
Triggered by EventBridge every Wednesday morning.

Flow:
  1. Pull current src/lib/data.json from GitHub
  2. Fetch new posts from Arctic Shift (Reddit) + X API
  3. Classify new posts with Claude (skip duplicates)
  4. Generate weekly digest
  5. Commit updated data.json back to GitHub
  6. Vercel auto-redeploys

Env vars required:
  ANTHROPIC_API_KEY, X_BEARER_TOKEN, GITHUB_TOKEN, GITHUB_REPO (e.g. razbee3-prog/financial-pain-dashboard)
"""

import base64
import json
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import anthropic
import requests

# ───────────────────────────── Constants ─────────────────────────────

SUBREDDITS = [
    "povertyfinance", "personalfinance", "YNAB", "Frugal",
    "FinancialPlanning", "MoneyDiariesACTIVE", "antiwork", "payroll",
]

X_SEARCH_QUERIES = [
    '"overdraft fee" OR "overdraft fees" OR "bank charged me" -is:retweet lang:en',
    '"can\'t pay rent" OR "can\'t afford rent" OR "late on rent" -is:retweet lang:en',
    '"paycheck to paycheck" OR "living paycheck" -is:retweet lang:en',
    '"payday loan" OR "payday loans" -is:retweet lang:en',
    '"can\'t save money" OR "no savings" OR "emergency fund" -is:retweet lang:en',
    '"credit card debt" OR "drowning in debt" OR "debt spiral" -is:retweet lang:en',
    '"unexpected bill" OR "medical bill" OR "car repair" broke -is:retweet lang:en',
    '"forgot subscription" OR "cancel subscription" OR "auto renewed" -is:retweet lang:en',
]

ARCTIC_SHIFT_BASE = "https://arctic-shift.photon-reddit.com"
GITHUB_API_BASE = "https://api.github.com"
DATA_FILE_PATH = "src/lib/data.json"
TIME_BUDGET_SECONDS = 13 * 60  # 13 of 15 minutes — leave time for commit

CLASSIFIER_PROMPT = """You are a financial pain point classifier for a product team building tools for paycheck-to-paycheck workers.

For each post, return a JSON object with the following fields:

{
  "relevant": true/false,
  "confidence": 0.0-1.0,
  "category": "one of the categories below",
  "subcategory": "more specific label",
  "pain_summary": "1-2 sentence summary of the core complaint in plain language",
  "raw_quote": "the most emotionally resonant sentence from the post",
  "severity": "low / medium / high / critical",
  "sentiment": "frustrated / desperate / resigned / angry / confused / hopeful",
  "demographic_signal": "any signal about income level, employment type, life stage"
}

CATEGORIES:
1. Overdraft & Bank Fees
2. Late Fees & Payment Cascades
3. Financial Visibility
4. Budgeting & Planning Overwhelm
5. Goal Setting & Savings Inability
6. Income Volatility & Timing
7. Debt Spiral
8. Emergency Expense Shock
9. Subscription & Recurring Charge Traps
10. Financial Tool Frustration

FILTERING RULES (aggressive):
- Mark "relevant": false for any post that is clearly from someone with high disposable income, investment portfolio questions, business-class travel complaints, luxury goods issues, or real estate investment discussions.
- Mark "relevant": false for posts that are purely informational with no emotional pain signal.
- Mark "relevant": true ONLY for posts where the person appears to genuinely be struggling financially.
- When in doubt, lean toward filtering OUT (aggressive filtering).

Return ONLY valid JSON, no markdown fences or extra text."""

DIGEST_PROMPT = """You are a product insights analyst. Given the following summary of financial pain points collected from Reddit and X/Twitter over the past week, generate exactly 3 concise takeaways for a product team building tools for paycheck-to-paycheck workers.

Each takeaway should be:
- One sentence, max 30 words
- Actionable (implies what to build or investigate)
- Specific (mention actual numbers, categories, or trends)

Return a JSON array of 3 strings. No markdown, no extra text.

DATA:
{data}"""


# ───────────────────────────── GitHub API ─────────────────────────────

def github_get_file(repo: str, path: str, token: str):
    """Fetch a file from GitHub. Returns (content_dict, sha)."""
    r = requests.get(
        f"{GITHUB_API_BASE}/repos/{repo}/contents/{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    decoded = base64.b64decode(data["content"]).decode("utf-8")
    return json.loads(decoded), data["sha"]


def github_put_file(repo: str, path: str, content: dict, sha: str, token: str, message: str):
    """Update a file in GitHub via Contents API."""
    encoded = base64.b64encode(json.dumps(content, default=str).encode("utf-8")).decode("ascii")
    r = requests.put(
        f"{GITHUB_API_BASE}/repos/{repo}/contents/{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        json={
            "message": message,
            "content": encoded,
            "sha": sha,
            "committer": {"name": "Pain Pulse Bot", "email": "bot@thedailydrop.tech"},
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


# ───────────────────────────── Reddit fetch (Arctic Shift) ─────────────────────────────

def fetch_reddit(after_date: str, limit_per_sub: int = 50):
    """Fetch posts from Arctic Shift across all target subreddits."""
    all_posts = []
    for sub in SUBREDDITS:
        try:
            r = requests.get(
                f"{ARCTIC_SHIFT_BASE}/api/posts/search",
                params={"subreddit": sub, "after": after_date, "limit": limit_per_sub, "sort": "desc"},
                timeout=30,
            )
            if r.status_code != 200:
                print(f"  Arctic Shift {sub} {r.status_code}")
                continue
            posts = r.json().get("data", [])
            for p in posts:
                if not p.get("selftext") or len(p.get("selftext", "")) < 50:
                    continue
                all_posts.append({
                    "id": f"reddit_{p.get('id', '')}",
                    "subreddit": sub,
                    "title": p.get("title", ""),
                    "body": (p.get("selftext") or "")[:1000],
                    "upvotes": p.get("score", 0),
                    "comment_count": p.get("num_comments", 0),
                    "permalink": p.get("permalink", ""),
                    "created_at": datetime.fromtimestamp(
                        p.get("created_utc", 0), tz=timezone.utc
                    ).isoformat() if p.get("created_utc") else datetime.now(timezone.utc).isoformat(),
                })
            time.sleep(1)
        except Exception as e:
            print(f"  Reddit fetch error for {sub}: {e}")
    return all_posts


# ───────────────────────────── X fetch ─────────────────────────────

def fetch_x(bearer_token: str):
    """Search recent tweets on X."""
    all_tweets = []
    for query in X_SEARCH_QUERIES:
        try:
            r = requests.get(
                "https://api.x.com/2/tweets/search/recent",
                headers={"Authorization": f"Bearer {bearer_token}"},
                params={
                    "query": query,
                    "max_results": 20,
                    "tweet.fields": "created_at,public_metrics,author_id,text",
                },
                timeout=30,
            )
            if r.status_code != 200:
                print(f"  X API {r.status_code}: {r.text[:150]}")
                if r.status_code in (401, 402, 429):
                    print("  X auth/credits issue — skipping remaining X queries")
                    return []
                continue
            tweets = r.json().get("data", [])
            for t in tweets:
                metrics = t.get("public_metrics", {})
                all_tweets.append({
                    "id": f"x_{t['id']}",
                    "subreddit": "x/twitter",
                    "title": t["text"][:100],
                    "body": t["text"],
                    "upvotes": metrics.get("like_count", 0),
                    "comment_count": metrics.get("reply_count", 0),
                    "permalink": f"https://x.com/i/status/{t['id']}",
                    "created_at": t.get("created_at", datetime.now(timezone.utc).isoformat()),
                })
            time.sleep(1)
        except Exception as e:
            print(f"  X fetch error: {e}")
    # Dedupe
    seen, unique = set(), []
    for t in all_tweets:
        if t["id"] not in seen:
            seen.add(t["id"])
            unique.append(t)
    return unique


# ───────────────────────────── Classification ─────────────────────────────

def classify(claude, content: str, max_retries: int = 4):
    """Send content to Claude for classification. Retries on 429 with exponential backoff."""
    for attempt in range(max_retries):
        try:
            resp = claude.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=512,
                system=CLASSIFIER_PROMPT,
                messages=[{"role": "user", "content": content}],
            )
            text = resp.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()
            return json.loads(text)
        except anthropic.RateLimitError:
            wait = 2 ** attempt + 1  # 2, 3, 5, 9 seconds
            print(f"  rate limited, retry {attempt + 1}/{max_retries} after {wait}s")
            time.sleep(wait)
        except Exception as e:
            print(f"  classify error: {e}")
            return None
    print(f"  gave up after {max_retries} retries")
    return None


def make_pain_point(post: dict, classification: dict) -> dict:
    severity = classification.get("severity", "medium").lower()
    if severity not in ("low", "medium", "high", "critical"):
        severity = "medium"

    return {
        "id": str(uuid.uuid4()),
        "reddit_post_id": post["id"],
        "subreddit": post["subreddit"],
        "title": post["title"],
        "body": post["body"],
        "raw_quote": classification.get("raw_quote"),
        "pain_summary": classification.get("pain_summary"),
        "category": classification.get("category", "Uncategorized"),
        "subcategory": classification.get("subcategory"),
        "severity": severity,
        "sentiment": classification.get("sentiment"),
        "confidence": classification.get("confidence"),
        "upvotes": post.get("upvotes", 0),
        "comment_count": post.get("comment_count", 0),
        "permalink": post["permalink"],
        "demographic_signal": classification.get("demographic_signal"),
        "created_at": post["created_at"],
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }


# ───────────────────────────── Digest ─────────────────────────────

def generate_digest(claude, posts: list):
    """Generate 3 takeaways from the last 7 days of posts."""
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recent = [p for p in posts if p.get("scraped_at", "") >= week_ago]
    if not recent:
        return None

    # Build a compact summary
    cat_buckets: dict = {}
    for p in recent:
        key = (p["category"], p["severity"])
        if key not in cat_buckets:
            cat_buckets[key] = {"count": 0, "quote": ""}
        cat_buckets[key]["count"] += 1
        if p.get("raw_quote") and not cat_buckets[key]["quote"]:
            cat_buckets[key]["quote"] = p["raw_quote"][:100]

    summary_lines = [f"Total posts this week: {len(recent)}\n"]
    for (cat, sev), info in sorted(cat_buckets.items(), key=lambda x: -x[1]["count"]):
        summary_lines.append(f'- {cat} ({sev}): {info["count"]} posts. Quote: "{info["quote"]}"')

    summary = "\n".join(summary_lines[:21])

    try:
        resp = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            messages=[{"role": "user", "content": DIGEST_PROMPT.format(data=summary)}],
        )
        text = resp.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
        takeaways = json.loads(text)
        if not isinstance(takeaways, list) or len(takeaways) < 3:
            return None

        now = datetime.now(timezone.utc)
        return {
            "id": str(uuid.uuid4()),
            "content": json.dumps(takeaways[:3]),
            "generated_at": now.isoformat(),
            "period_start": week_ago,
            "period_end": now.isoformat(),
        }
    except Exception as e:
        print(f"  digest error: {e}")
        return None


# ───────────────────────────── Lambda entry point ─────────────────────────────

def lambda_handler(event, context):
    start = time.time()
    print(f"=== Pain Pulse refresh started at {datetime.now().isoformat()} ===")

    anthropic_key = os.environ["ANTHROPIC_API_KEY"]
    x_token = os.environ.get("X_BEARER_TOKEN", "")
    github_token = os.environ["GITHUB_TOKEN"]
    github_repo = os.environ["GITHUB_REPO"]

    claude = anthropic.Anthropic(api_key=anthropic_key)

    # Step 1: pull current data.json from GitHub
    print("[1/5] Loading data.json from GitHub...")
    data, sha = github_get_file(github_repo, DATA_FILE_PATH, github_token)
    existing_ids = {p["reddit_post_id"] for p in data["posts"]}
    print(f"  Loaded {len(data['posts'])} existing posts, {len(data.get('digests', []))} digests")

    # Step 2: fetch fresh posts (last 7 days)
    print("[2/5] Fetching from Reddit (Arctic Shift)...")
    after_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    reddit_posts = fetch_reddit(after_date, limit_per_sub=50)
    print(f"  Got {len(reddit_posts)} Reddit posts")

    print("[3/5] Fetching from X...")
    x_posts = fetch_x(x_token) if x_token else []
    print(f"  Got {len(x_posts)} X tweets")

    new_candidates = [p for p in reddit_posts + x_posts if p["id"] not in existing_ids]
    print(f"  {len(new_candidates)} candidates after dedup")

    # Step 3: classify
    print("[4/5] Classifying with Claude...")
    stored = 0
    skipped = 0
    for i, post in enumerate(new_candidates):
        if time.time() - start > TIME_BUDGET_SECONDS:
            print(f"  Time budget exceeded at post {i}/{len(new_candidates)}")
            break
        content = f"Title: {post['title']}\nBody: {post['body']}"
        cls = classify(claude, content)
        if not cls or not cls.get("relevant"):
            skipped += 1
            continue
        data["posts"].append(make_pain_point(post, cls))
        stored += 1
        if (i + 1) % 25 == 0:
            print(f"  Processed {i + 1}/{len(new_candidates)} (stored={stored})")
        time.sleep(1.3)  # ~46 req/min, under 50/min rate limit
    print(f"  Stored {stored}, skipped {skipped} (filtered)")

    # Step 4: generate digest
    print("[5/5] Generating weekly digest...")
    digest = generate_digest(claude, data["posts"])
    if digest:
        if "digests" not in data:
            data["digests"] = []
        data["digests"].append(digest)
        print(f"  Digest stored with {len(json.loads(digest['content']))} takeaways")

    # Step 5: commit back to GitHub
    print("Committing to GitHub...")
    commit_msg = f"refresh: +{stored} posts via AWS Lambda ({datetime.now().strftime('%Y-%m-%d')})"
    github_put_file(github_repo, DATA_FILE_PATH, data, sha, github_token, commit_msg)
    print(f"=== Done. Total posts: {len(data['posts'])}, total digests: {len(data['digests'])} ===")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "stored": stored,
            "skipped_filtered": skipped,
            "candidates": len(new_candidates),
            "total_posts": len(data["posts"]),
        }),
    }
