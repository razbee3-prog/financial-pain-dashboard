#!/usr/bin/env python3
"""
Generate realistic financial pain points using Claude.
Produces ~200 pain points across all 10 categories with varied
severity, sentiment, and demographic signals.
"""

import json
import os
import sqlite3
import sys
import uuid
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import anthropic
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path, override=True)

CATEGORIES = [
    "Overdraft & Bank Fees",
    "Late Fees & Payment Cascades",
    "Financial Visibility",
    "Budgeting & Planning Overwhelm",
    "Goal Setting & Savings Inability",
    "Income Volatility & Timing",
    "Debt Spiral",
    "Emergency Expense Shock",
    "Subscription & Recurring Charge Traps",
    "Financial Tool Frustration",
]

SUBREDDITS = [
    "povertyfinance", "personalfinance", "YNAB", "Frugal",
    "FinancialPlanning", "MoneyDiariesACTIVE", "antiwork", "payroll",
]

PROMPT = """Generate exactly 20 realistic financial pain point posts for the category: "{category}"

These should read like real Reddit posts from people genuinely struggling financially — paycheck to paycheck workers, people dealing with poverty, debt, or financial frustration.

Return a JSON array of 20 objects, each with:
{{
  "title": "realistic Reddit post title (emotional, specific, first-person)",
  "body": "1-3 sentence post body with specific details and emotion (max 500 chars)",
  "raw_quote": "the single most emotionally resonant sentence",
  "pain_summary": "1-2 sentence plain-language summary of the core complaint",
  "subcategory": "specific sub-issue within {category}",
  "severity": "low|medium|high|critical (distribute: 10% low, 30% medium, 40% high, 20% critical)",
  "sentiment": "frustrated|desperate|resigned|angry|confused|hopeful (vary these)",
  "demographic_signal": "brief signal about income/employment/life stage",
  "upvotes": number between 50 and 5000 (higher for more relatable posts),
  "comment_count": number between 10 and 800
}}

Make each post unique and specific — real dollar amounts, real situations, real emotions. No generic complaints. Vary the demographics: single parents, gig workers, retail workers, students, elderly on fixed income, military families, etc.

Return ONLY the JSON array, no markdown fences or extra text."""


def get_db():
    db_path = Path(__file__).resolve().parent.parent / "data" / "pain_points.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def run():
    print("=" * 60)
    print("Generating realistic pain points with Claude")
    print("=" * 60)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: Missing ANTHROPIC_API_KEY in .env")
        sys.exit(1)

    claude = anthropic.Anthropic(api_key=api_key)
    db = get_db()
    total_stored = 0
    now = datetime.now(timezone.utc)

    for cat_idx, category in enumerate(CATEGORIES):
        print(f"\n[{cat_idx + 1}/{len(CATEGORIES)}] Generating: {category}...")

        try:
            response = claude.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=8000,
                messages=[{
                    "role": "user",
                    "content": PROMPT.format(category=category),
                }],
            )

            text = response.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

            posts = json.loads(text)
            print(f"  Generated {len(posts)} posts")

            for i, post in enumerate(posts):
                # Spread across last 30 days
                days_ago = random.randint(0, 29)
                hours_ago = random.randint(0, 23)
                mins_ago = random.randint(0, 59)
                created_at = now - timedelta(days=days_ago, hours=hours_ago, minutes=mins_ago)
                scraped_at = created_at + timedelta(hours=random.randint(1, 6))

                subreddit = random.choice(SUBREDDITS)
                severity = post.get("severity", "medium").lower()
                if severity not in ("low", "medium", "high", "critical"):
                    severity = "medium"

                post_id = f"gen_{cat_idx}_{i}_{uuid.uuid4().hex[:8]}"

                try:
                    db.execute(
                        """INSERT OR IGNORE INTO pain_points
                        (id, reddit_post_id, subreddit, title, body, raw_quote,
                         pain_summary, category, subcategory, severity, sentiment,
                         confidence, upvotes, comment_count, permalink,
                         demographic_signal, created_at, scraped_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            str(uuid.uuid4()),
                            post_id,
                            subreddit,
                            post.get("title", ""),
                            post.get("body", ""),
                            post.get("raw_quote"),
                            post.get("pain_summary"),
                            category,
                            post.get("subcategory"),
                            severity,
                            post.get("sentiment"),
                            round(random.uniform(0.8, 0.98), 2),
                            post.get("upvotes", random.randint(50, 2000)),
                            post.get("comment_count", random.randint(10, 400)),
                            f"/r/{subreddit}/comments/{post_id}",
                            post.get("demographic_signal"),
                            created_at.isoformat(),
                            scraped_at.isoformat(),
                        ),
                    )
                    total_stored += 1
                except Exception as e:
                    print(f"  DB error: {e}")

            db.commit()

        except json.JSONDecodeError as e:
            print(f"  JSON parse error: {e}")
        except Exception as e:
            print(f"  Error: {e}")

    print("\n" + "=" * 60)
    print(f"Done! Stored {total_stored} pain points.")

    count = db.execute("SELECT count(*) FROM pain_points").fetchone()[0]
    print(f"Total records in DB: {count}")
    print("=" * 60)

    db.close()


if __name__ == "__main__":
    run()
