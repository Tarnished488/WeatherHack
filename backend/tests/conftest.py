"""Shared fixtures: in-memory DB with schema + a seeded fetch_run row."""
from __future__ import annotations

import json

import pytest

from app.db import connect, ensure_schema


@pytest.fixture()
def conn():
    conn = connect(":memory:")
    ensure_schema(conn)
    conn.execute(
        "INSERT INTO fetch_runs (source, started_at_utc, status) "
        "VALUES ('test-source', '2026-01-01T00:00:00Z', 'ok')"
    )
    conn.commit()
    yield conn
    conn.close()


@pytest.fixture(scope="session")
def thresholds():
    from app.config import load_thresholds

    return load_thresholds()


def insert_obs(conn, ts: str, *, is_valid: int = 1, flags: list | None = None,
               ingested: str = "2026-01-01T00:00:00Z", **fields) -> None:
    """Insert one observation with NULL defaults for optional sensor fields."""
    cols = {
        "observed_at_utc": ts,
        "fetch_run_id": 1,
        "rg1": None,
        "rg2": None,
        "rg1tt": None,
        "rg2tt": None,
        "temp_sht": None,
        "humidity_sht": None,
        "wind_spd": None,
        "wind_gust": None,
        "heat_idx": None,
        "is_valid": is_valid,
        "quality_flags_json": json.dumps(flags or []),
        "ingested_at_utc": ingested,
    }
    cols.update(fields)
    placeholders = ", ".join("?" for _ in cols)
    conn.execute(
        f"INSERT INTO weather_observations ({', '.join(cols)}) VALUES ({placeholders})",
        tuple(cols.values()),
    )
