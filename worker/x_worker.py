#!/usr/bin/env python3
"""
Financial Pain Point Worker — X/Twitter Edition
Searches X for financial pain tweets, classifies them with Claude,
and stores results in SQLite.
"""

import json
import os
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import anthropic
import requests
from dotenv import load_dotenv

# Load env from project root
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path, override=True)

# Search queries targeting financial pain points
SEARCH_QUERIES = [
    '"overdraft fee" OR "overdraft fees" OR "bank charged me" -is:retweet lang:en',
    '"can\'t pay rent" OR "can\'t afford rent" OR "late on rent" -is:retweet lang:en',
    '"paycheck to paycheck" OR "living paycheck" -is:retweet lang:en',
    '"payday loan" OR "payday loans" -is:retweet lang:en',
    '"can\'t save money" OR "no savings" OR "emergency fund" -is:retweet lang:en',
    '"late fee" OR "late fees" OR "late payment" -filter:links -is:retweet lang:en',
    '"credit card debt" OR "drowning in debt" OR "debt spiral" -is:retweet lang:en',
    '"unexpected bill" OR "medical bill" OR "car repair" broke -is:retweet lang:en',
    '"forgot subscription" OR "cancel subscription" OR "auto renewed" -is:retweet lang:en',
    '"banking app" OR "finance app" frustrating OR broken OR useless -is:retweet lang:en',
]

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
- Mark "relevant": false for promotional tweets, ads, or financial advice accounts.
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


def search_x(bearer_token, query, max_results=20):
    """Search recent tweets using X API v2."""
    url = "https://api.x.com/2/tweets/search/recent"
    headers = {"Authorization": f"Bearer {bearer_token}"}
    params = {
        "query": query,
        "max_results": min(max_results, 100),
        "tweet.fields": "created_at,public_metrics,author_id,text",
    }

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("data", [])
        elif resp.status_code == 429:
            print(f"  Rate limited. Waiting 15 seconds...")
            time.sleep(15)
            return []
        else:
            print(f"  X API error {resp.status_code}: {resp.text[:200]}")
            return []
    except Exception as e:
        print(f"  Request error: {e}")
        return []


def classify_post(claude, text):
    """Send tweet to Claude for classification."""
    try:
        response = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            system=CLASSIFIER_PROMPT,
            messages=[{"role": "user", "content": f"Tweet: {text}"}],
        )

        result_text = response.content[0].text.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("\n", 1)[1]
            if result_text.endswith("```"):
                result_text = result_text[:-3]
            result_text = result_text.strip()

        return json.loads(result_text)
    except json.JSONDecodeError as e:
        print(f"  JSON parse error: {e}")
        return None
    except Exception as e:
        print(f"  Classification error: {e}")
        return None


def run():
    print("=" * 60)
    print("Financial Pain Point Worker — X/Twitter")
    print(f"Started at: {datetime.now().isoformat()}")
    print("=" * 60)

    bearer_token = os.environ.get("X_BEARER_TOKEN")
    api_key = os.environ.get("ANTHROPIC_API_KEY")

    if not bearer_token:
        print("ERROR: Missing X_BEARER_TOKEN in .env")
        sys.exit(1)
    if not api_key:
        print("ERROR: Missing ANTHROPIC_API_KEY in .env")
        sys.exit(1)

    db = get_db()
    claude = anthropic.Anthropic(api_key=api_key)

    # Step 1: Search X
    print("\n[Step 1] Searching X for financial pain tweets...")
    all_tweets = []

    for i, query in enumerate(SEARCH_QUERIES):
        short_query = query[:50] + "..."
        print(f"  Query {i + 1}/{len(SEARCH_QUERIES)}: {short_query}")
        tweets = search_x(bearer_token, query, max_results=20)
        all_tweets.extend(tweets)
        # Respect rate limits
        if i < len(SEARCH_QUERIES) - 1:
            time.sleep(1)

    # Deduplicate by tweet ID
    seen = set()
    unique_tweets = []
    for t in all_tweets:
        if t["id"] not in seen:
            seen.add(t["id"])
            unique_tweets.append(t)

    print(f"  Total unique tweets: {len(unique_tweets)}")

    # Step 2: Classify
    print("\n[Step 2] Classifying tweets with Claude...")
    stored = 0
    skipped_dup = 0
    skipped_irrelevant = 0
    errors = 0

    for i, tweet in enumerate(unique_tweets):
        tweet_id = f"x_{tweet['id']}"

        # Dedup check
        cursor = db.execute(
            "SELECT 1 FROM pain_points WHERE reddit_post_id = ?", (tweet_id,)
        )
        if cursor.fetchone():
            skipped_dup += 1
            continue

        classification = classify_post(claude, tweet["text"])
        if not classification:
            errors += 1
            continue

        if not classification.get("relevant", False):
            skipped_irrelevant += 1
            continue

        severity = classification.get("severity", "medium").lower()
        if severity not in ("low", "medium", "high", "critical"):
            severity = "medium"

        metrics = tweet.get("public_metrics", {})
        created_at = tweet.get("created_at", datetime.now(timezone.utc).isoformat())

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
                    tweet_id,
                    "x/twitter",  # stored in subreddit field
                    tweet["text"][:100],  # first 100 chars as title
                    tweet["text"],
                    classification.get("raw_quote"),
                    classification.get("pain_summary"),
                    classification.get("category", "Uncategorized"),
                    classification.get("subcategory"),
                    severity,
                    classification.get("sentiment"),
                    classification.get("confidence"),
                    metrics.get("like_count", 0),
                    metrics.get("reply_count", 0),
                    f"https://x.com/i/status/{tweet['id']}",
                    classification.get("demographic_signal"),
                    created_at,
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
        if i < len(unique_tweets) - 1:
            time.sleep(0.5)

        if (i + 1) % 25 == 0:
            print(f"  Processed {i + 1}/{len(unique_tweets)} tweets...")

    # Summary
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Tweets fetched:      {len(unique_tweets)}")
    print(f"  Stored (relevant):   {stored}")
    print(f"  Skipped (duplicate): {skipped_dup}")
    print(f"  Skipped (filtered):  {skipped_irrelevant}")
    print(f"  Errors:              {errors}")
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
