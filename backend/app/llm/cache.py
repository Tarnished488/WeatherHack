"""SQLite cache for LLM-generated advice.

One row per (rules_version, window_end_utc, model): the dashboard can call
/api/llm-advice repeatedly without re-spending tokens on an unchanged
evaluation.  ``force_refresh`` bypasses reads but still overwrites the row.

The table DDL lives in app/db.py (single schema owner); this module only
performs reads/writes.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from ..db import LLM_ADVICE_CACHE_DDL


def ensure_cache_table(conn) -> None:
    """Create the advice cache table if missing (idempotent)."""
    conn.execute(LLM_ADVICE_CACHE_DDL)
    conn.commit()


def cache_key(rules_version: str, window_end_utc: str, model: str) -> str:
    return f"{rules_version}|{window_end_utc}|{model}"


def read_cache(conn, key: str):
    """Return the cached advice dict, or None on a miss."""
    row = conn.execute(
        "SELECT advice_json FROM llm_advice_cache WHERE cache_key = ?", (key,)
    ).fetchone()
    return json.loads(row["advice_json"]) if row else None


def write_cache(conn, key: str, model: str, evaluation: dict, advice: dict) -> None:
    """Insert or overwrite the cached advice for this key."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute(
        """INSERT INTO llm_advice_cache
             (cache_key, model, rules_version, window_end_utc, risk_level, advice_json, created_at_utc)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(cache_key) DO UPDATE SET
             model = excluded.model,
             advice_json = excluded.advice_json,
             created_at_utc = excluded.created_at_utc""",
        (
            key,
            model,
            evaluation.get("rules_version"),
            evaluation.get("window_end_utc"),
            evaluation.get("risk_level"),
            json.dumps(advice, ensure_ascii=False),
            now,
        ),
    )
    conn.commit()
