#!/usr/bin/env python3
"""
Financial Pain Point Worker — Reddit via Arctic Shift
Fetches real Reddit posts from Arctic Shift (no API key needed),
classifies them with Claude, and stores results in SQLite.
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
import requests
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path, override=True)

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

ARCTIC_SHIFT_BASE = "https://arctic-shift.photon-reddit.com"

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
    conn.commit()
    return conn


def fetch_arctic_shift(subreddit, after_date, limit=100):
    """Fetch posts from Arctic Shift API (no auth needed)."""
    url = f"{ARCTIC_SHIFT_BASE}/api/posts/search"
    params = {
        "subreddit": subreddit,
        "after": after_date,
        "limit": min(limit, 100),
        "sort": "desc",
    }

    try:
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("data", [])
        elif resp.status_code == 429:
            print(f"  Rate limited. Waiting 5 seconds...")
            time.sleep(5)
            return []
        else:
            print(f"  Arctic Shift error {resp.status_code}: {resp.text[:200]}")
            return []
    except Exception as e:
        print(f"  Request error: {e}")
        return []


def classify_post(claude, title, body):
    """Send post to Claude for classification."""
    content = f"Title: {title}\nBody: {body}"

    try:
        response = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            system=CLASSIFIER_PROMPT,
            messages=[{"role": "user", "content": content}],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"  JSON parse error: {e}")
        return None
    except Exception as e:
        print(f"  Classification error: {e}")
        return None


def run():
    print("=" * 60)
    print("Financial Pain Point Worker — Reddit (Arctic Shift)")
    print(f"Started at: {datetime.now().isoformat()}")
    print("=" * 60)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: Missing ANTHROPIC_API_KEY in .env")
        sys.exit(1)

    db = get_db()
    claude = anthropic.Anthropic(api_key=api_key)

    # Fetch posts from last 7 days (Arctic Shift has archive delay)
    after_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    # Step 1: Fetch from Arctic Shift
    print(f"\n[Step 1] Fetching Reddit posts via Arctic Shift (after {after_date})...")
    all_posts = []

    for i, sub in enumerate(SUBREDDITS):
        print(f"  [{i + 1}/{len(SUBREDDITS)}] r/{sub}...")
        posts = fetch_arctic_shift(sub, after_date, limit=50)
        all_posts.extend(
            [
                {
                    "id": p.get("id", ""),
                    "subreddit": sub,
                    "title": p.get("title", ""),
                    "body": (p.get("selftext") or "")[:1000],
                    "upvotes": p.get("score", 0),
                    "comment_count": p.get("num_comments", 0),
                    "permalink": p.get("permalink", ""),
                    "created_utc": datetime.fromtimestamp(
                        p.get("created_utc", 0), tz=timezone.utc
                    ).isoformat()
                    if p.get("created_utc")
                    else datetime.now(timezone.utc).isoformat(),
                }
                for p in posts
                if p.get("selftext") and len(p.get("selftext", "")) > 50
            ]
        )
        # Respect rate limits
        if i < len(SUBREDDITS) - 1:
            time.sleep(1)

    print(f"  Total posts with body text: {len(all_posts)}")

    # Step 2: Classify
    print("\n[Step 2] Classifying posts with Claude...")
    stored = 0
    skipped_dup = 0
    skipped_irrelevant = 0
    errors = 0

    for i, post in enumerate(all_posts):
        reddit_id = f"reddit_{post['id']}"

        # Dedup
        cursor = db.execute(
            "SELECT 1 FROM pain_points WHERE reddit_post_id = ?", (reddit_id,)
        )
        if cursor.fetchone():
            skipped_dup += 1
            continue

        classification = classify_post(claude, post["title"], post["body"])
        if not classification:
            errors += 1
            continue

        if not classification.get("relevant", False):
            skipped_irrelevant += 1
            continue

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
                    reddit_id,
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
            print(f"  DB error: {e}")
            errors += 1

        # Rate limit for Claude
        if i < len(all_posts) - 1:
            time.sleep(0.5)

        if (i + 1) % 25 == 0:
            print(f"  Processed {i + 1}/{len(all_posts)} posts...")

    # Summary
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Posts fetched:       {len(all_posts)}")
    print(f"  Stored (relevant):   {stored}")
    print(f"  Skipped (duplicate): {skipped_dup}")
    print(f"  Skipped (filtered):  {skipped_irrelevant}")
    print(f"  Errors:              {errors}")

    total = db.execute("SELECT count(*) FROM pain_points").fetchone()[0]
    print(f"  Total in DB:         {total}")
    print(f"Finished at: {datetime.now().isoformat()}")
    print("=" * 60)

    db.close()

    # Generate weekly digest
    print("\n[Step 3] Generating weekly digest...")
    from digest import generate_digest
    db_path = str(Path(__file__).resolve().parent.parent / "data" / "pain_points.db")
    generate_digest(db_path, api_key)


if __name__ == "__main__":
    run()
