#!/usr/bin/env python3
"""
Financial Pain Point Worker
Scrapes Reddit for financial pain posts, classifies them with Claude,
and stores results in SQLite.
"""

import json
import os
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import anthropic
import praw
from dotenv import load_dotenv

# Load env from project root
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

SUBREDDITS = [
    "povertyfinance",
    "personalfinance",
    "YNAB",
    "Frugal",
    "FinancialPlanning",
    "MoneyDiariesACTIVE",
    "antiwork",
    "payroll",
]

CLASSIFIER_PROMPT = """You are a financial pain point classifier for a product team building tools for paycheck-to-paycheck workers.

For each post, return a JSON object with the following fields:

{
  "relevant": true/false,
  "confidence": 0.0-1.0,
  "category": "one of the categories below",
  "subcategory": "more specific label",
  "pain_summary": "1-2 sentence summary of the core complaint in plain language",
  "raw_quote": "the most emotionally resonant sentence from the post or comments",
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


def get_db():
    db_path = Path(__file__).resolve().parent.parent / "data" / "pain_points.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pain_points (
            id TEXT PRIMARY KEY,
            reddit_post_id TEXT NOT NULL UNIQUE,
            subreddit TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT,
            raw_quote TEXT,
            pain_summary TEXT,
            category TEXT NOT NULL,
            subcategory TEXT,
            severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
            sentiment TEXT,
            confidence REAL,
            upvotes INTEGER DEFAULT 0,
            comment_count INTEGER DEFAULT 0,
            permalink TEXT,
            demographic_signal TEXT,
            created_at TEXT NOT NULL,
            scraped_at TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_category ON pain_points(category)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_severity ON pain_points(severity)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON pain_points(created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_subreddit ON pain_points(subreddit)")
    conn.commit()
    return conn


def get_reddit():
    return praw.Reddit(
        client_id=os.environ["REDDIT_CLIENT_ID"],
        client_secret=os.environ["REDDIT_CLIENT_SECRET"],
        user_agent=os.environ.get("REDDIT_USER_AGENT", "FinancialPainDashboard/1.0"),
    )


def get_claude():
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def fetch_posts(reddit):
    """Fetch new posts from target subreddits (last 24h)."""
    posts = []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    for sub_name in SUBREDDITS:
        print(f"  Fetching r/{sub_name}...")
        try:
            subreddit = reddit.subreddit(sub_name)
            for post in subreddit.new(limit=100):
                created = datetime.fromtimestamp(post.created_utc, tz=timezone.utc)
                if created < cutoff:
                    continue

                # Get top 5 comments
                post.comment_sort = "top"
                post.comments.replace_more(limit=0)
                top_comments = [
                    c.body for c in post.comments[:5] if hasattr(c, "body")
                ]

                posts.append(
                    {
                        "id": post.id,
                        "subreddit": sub_name,
                        "title": post.title,
                        "body": (post.selftext or "")[:1000],
                        "top_comments": top_comments,
                        "upvotes": post.score,
                        "comment_count": post.num_comments,
                        "permalink": post.permalink,
                        "created_utc": created.isoformat(),
                    }
                )
        except Exception as e:
            print(f"  Error fetching r/{sub_name}: {e}")

    print(f"  Total posts fetched: {len(posts)}")
    return posts


def classify_post(claude, post):
    """Send post to Claude for classification."""
    content = f"""Title: {post['title']}
Body: {post['body']}
Top Comments: {chr(10).join(post['top_comments'][:5])}"""

    try:
        response = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            system=CLASSIFIER_PROMPT,
            messages=[{"role": "user", "content": content}],
        )

        text = response.content[0].text.strip()
        # Handle potential markdown fences
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"  JSON parse error for post {post['id']}: {e}")
        return None
    except Exception as e:
        print(f"  Classification error for post {post['id']}: {e}")
        return None


def run():
    print("=" * 60)
    print("Financial Pain Point Worker")
    print(f"Started at: {datetime.now().isoformat()}")
    print("=" * 60)

    # Validate env vars
    required = ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "ANTHROPIC_API_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"ERROR: Missing env vars: {', '.join(missing)}")
        print("Copy .env.example to .env and fill in your credentials.")
        sys.exit(1)

    db = get_db()
    reddit = get_reddit()
    claude = get_claude()

    # Step 1: Fetch
    print("\n[Step 1] Fetching posts from Reddit...")
    posts = fetch_posts(reddit)

    # Step 2: Classify
    print("\n[Step 2] Classifying posts with Claude...")
    stored = 0
    skipped_dup = 0
    skipped_irrelevant = 0
    errors = 0

    for i, post in enumerate(posts):
        # Dedup check
        cursor = db.execute(
            "SELECT 1 FROM pain_points WHERE reddit_post_id = ?", (post["id"],)
        )
        if cursor.fetchone():
            skipped_dup += 1
            continue

        classification = classify_post(claude, post)
        if not classification:
            errors += 1
            continue

        if not classification.get("relevant", False):
            skipped_irrelevant += 1
            continue

        # Validate severity
        severity = classification.get("severity", "medium").lower()
        if severity not in ("low", "medium", "high", "critical"):
            severity = "medium"

        try:
            db.execute(
                """INSERT INTO pain_points
                (id, reddit_post_id, subreddit, title, body, raw_quote,
                 pain_summary, category, subcategory, severity, sentiment,
                 confidence, upvotes, comment_count, permalink,
                 demographic_signal, created_at, scraped_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()),
                    post["id"],
                    post["subreddit"],
                    post["title"],
                    post["body"],
                    classification.get("raw_quote"),
                    classification.get("pain_summary"),
                    classification.get("category", "Uncategorized"),
                    classification.get("subcategory"),
                    severity,
                    classification.get("sentiment"),
                    classification.get("confidence"),
                    post["upvotes"],
                    post["comment_count"],
                    post["permalink"],
                    classification.get("demographic_signal"),
                    post["created_utc"],
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            db.commit()
            stored += 1
        except sqlite3.IntegrityError:
            skipped_dup += 1
        except Exception as e:
            print(f"  DB error for post {post['id']}: {e}")
            errors += 1

        # Rate limit: ~1 req/sec for Claude API
        if i < len(posts) - 1:
            time.sleep(0.5)

        # Progress
        if (i + 1) % 25 == 0:
            print(f"  Processed {i + 1}/{len(posts)} posts...")

    # Summary
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Posts fetched:       {len(posts)}")
    print(f"  Stored (relevant):   {stored}")
    print(f"  Skipped (duplicate): {skipped_dup}")
    print(f"  Skipped (filtered):  {skipped_irrelevant}")
    print(f"  Errors:              {errors}")
    print(f"Finished at: {datetime.now().isoformat()}")
    print("=" * 60)

    db.close()


if __name__ == "__main__":
    run()
