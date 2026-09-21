"""SQLite access layer for MajiGuard.

Owns the connection helper and schema bootstrap. The `weather_observations`
table belongs to the data teammate and is created verbatim only when missing
so this module never clobbers their schema.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

# Teammate's table — keep the DDL byte-for-byte identical to the agreed schema.
WEATHER_OBSERVATIONS_DDL = """
CREATE TABLE IF NOT EXISTS weather_observations (
id                       INTEGER PRIMARY KEY,
observed_at_utc          TEXT NOT NULL UNIQUE,
fetch_run_id             INTEGER NOT NULL,
rg1                      REAL,
rg2                      REAL,
rg1tt                    REAL,
rg2tt                    REAL,
rg1tp                    REAL,
rg2tp                    REAL,
temp_bmx                 REAL,
press_bmx                REAL,
temp_mcp                 REAL,
temp_sht                 REAL,
humidity_sht             REAL,
si1145_vis               REAL,
si1145_ir                REAL,
si1145_uv                REAL,
wind_spd                 REAL,
wind_dir                 REAL,
wind_gust                REAL,
wind_gust_dir            REAL,
heat_idx                 REAL,
wet_bulb_temp            REAL,
wet_bulb_globe_temp      REAL,
is_valid                 INTEGER NOT NULL DEFAULT 1,
quality_flags_json       TEXT NOT NULL DEFAULT '[]',
ingested_at_utc          TEXT NOT NULL,
FOREIGN KEY (fetch_run_id) REFERENCES fetch_runs(id)
);
"""

# Minimal fetch_runs table compatible with the FK above.
FETCH_RUNS_DDL = """
CREATE TABLE IF NOT EXISTS fetch_runs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source           TEXT NOT NULL,
    started_at_utc   TEXT NOT NULL,
    finished_at_utc  TEXT,
    rows_read        INTEGER NOT NULL DEFAULT 0,
    rows_inserted    INTEGER NOT NULL DEFAULT 0,
    rows_flagged     INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'ok'
);
"""

# Risk engine output (step 5 of the workflow). One row per
# (window_end_utc, rules_version) so re-running the pipeline is idempotent.
RISK_EVALUATIONS_DDL = """
CREATE TABLE IF NOT EXISTS risk_evaluations (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    window_end_utc       TEXT NOT NULL,
    evaluated_at_utc     TEXT NOT NULL,
    rules_version        TEXT NOT NULL,
    risk_score           REAL NOT NULL,
    risk_level           TEXT NOT NULL CHECK (risk_level IN ('Low', 'Medium', 'High')),
    confidence           REAL NOT NULL,
    triggers_json        TEXT NOT NULL,
    recommendations_json TEXT NOT NULL,
    features_json        TEXT NOT NULL,
    UNIQUE (window_end_utc, rules_version)
);
"""

# LLM advice cache (optional flexible-advice layer, app/llm_advisor.py).
# One row per (rules_version, window_end_utc, model) so repeated dashboard
# calls do not re-spend tokens on an unchanged evaluation.
LLM_ADVICE_CACHE_DDL = """
CREATE TABLE IF NOT EXISTS llm_advice_cache (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key        TEXT NOT NULL UNIQUE,
    model            TEXT NOT NULL,
    rules_version    TEXT NOT NULL,
    window_end_utc   TEXT NOT NULL,
    risk_level       TEXT NOT NULL,
    advice_json      TEXT NOT NULL,
    created_at_utc   TEXT NOT NULL
);
"""

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "majiguard.db"


def connect(db_path: str | Path = DEFAULT_DB_PATH) -> sqlite3.Connection:
    """Open a SQLite connection with row access and FK enforcement on.

    check_same_thread=False: the API layer creates one connection per request
    (never shared concurrently), and TestClient runs sync endpoints in a
    worker thread, so cross-thread use of a single sequential connection
    must be allowed.
    """
    if str(db_path) != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    """Create any missing tables (never drops or alters existing ones)."""
    conn.execute(FETCH_RUNS_DDL)
    conn.execute(WEATHER_OBSERVATIONS_DDL)
    conn.execute(RISK_EVALUATIONS_DDL)
    conn.execute(LLM_ADVICE_CACHE_DDL)
    conn.commit()
