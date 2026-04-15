"""
Shared digest generator — called at the end of each worker run.
Queries last 7 days of pain points, sends to Claude for 3 takeaways,
and stores the result in the digests table.
"""

import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import anthropic


DIGEST_PROMPT = """You are a product insights analyst. Given the following summary of financial pain points collected from Reddit and X/Twitter over the past week, generate exactly 3 concise takeaways for a product team building tools for paycheck-to-paycheck workers.

Each takeaway should be:
- One sentence, max 30 words
- Actionable (implies what to build or investigate)
- Specific (mention actual numbers, categories, or trends)

Return a JSON array of 3 strings. No markdown, no extra text.

DATA:
{data}"""


def generate_digest(db_path: str, api_key: str):
    """Generate a weekly digest from the last 7 days of data."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()

    # Gather summary data
    rows = conn.execute(
        """SELECT category, severity, count(*) as cnt,
           GROUP_CONCAT(raw_quote, ' | ') as quotes
           FROM pain_points
           WHERE scraped_at >= ?
           GROUP BY category, severity
           ORDER BY cnt DESC""",
        (week_ago,),
    ).fetchall()

    if not rows:
        print("  No data in last 7 days — skipping digest.")
        conn.close()
        return

    # Build summary text
    summary_lines = []
    for r in rows:
        top_quote = (r["quotes"] or "").split(" | ")[0][:100]
        summary_lines.append(
            f"- {r['category']} ({r['severity']}): {r['cnt']} posts. Quote: \"{top_quote}\""
        )

    total = conn.execute(
        "SELECT count(*) as n FROM pain_points WHERE scraped_at >= ?",
        (week_ago,),
    ).fetchone()["n"]

    summary = f"Total posts this week: {total}\n\n" + "\n".join(summary_lines[:20])

    # Call Claude
    print("  Generating digest with Claude...")
    claude = anthropic.Anthropic(api_key=api_key)

    try:
        response = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            messages=[
                {"role": "user", "content": DIGEST_PROMPT.format(data=summary)}
            ],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        takeaways = json.loads(text)

        if not isinstance(takeaways, list) or len(takeaways) < 3:
            print("  Invalid digest format — skipping.")
            conn.close()
            return

        # Store digest
        conn.execute("CREATE TABLE IF NOT EXISTS digests (id TEXT PRIMARY KEY, content TEXT NOT NULL, generated_at TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL)")
        conn.execute(
            "INSERT INTO digests (id, content, generated_at, period_start, period_end) VALUES (?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                json.dumps(takeaways[:3]),
                now.isoformat(),
                week_ago,
                now.isoformat(),
            ),
        )
        conn.commit()
        print(f"  Digest stored: {takeaways[:3]}")

    except Exception as e:
        print(f"  Digest generation error: {e}")

    conn.close()
