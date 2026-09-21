"""Feature extraction over weather_observations (step 2 of the workflow).

Pulls raw observations for the relevant windows (1h / 24h / 72h / 7d),
aggregates interpretable features, and computes the data-quality metrics
that drive the confidence score. Only rows with is_valid = 1 contribute to
environmental aggregates; quality metrics look at all rows so that gaps and
flagged data lower confidence instead of disappearing silently.
"""
from __future__ import annotations

import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, timezone

# Fields the risk workflow depends on (step 1: extract key fields).
KEY_FIELDS = ("rg1", "rg2", "temp_sht", "humidity_sht", "wind_spd")
AGG_FIELDS = ("rg1", "rg2", "temp_sht", "humidity_sht", "wind_spd", "wind_gust", "heat_idx")

WINDOW_1H = timedelta(hours=1)
WINDOW_24H = timedelta(hours=24)
WINDOW_72H = timedelta(hours=72)
WINDOW_7D = timedelta(days=7)

# Fetch a slightly wider SQL window; exact filtering happens in Python so the
# code tolerates minor timestamp format variations in the teammate's table.
SQL_MARGIN = timedelta(hours=6)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def fmt_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _to_float(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def latest_observation_time(conn: sqlite3.Connection) -> str | None:
    row = conn.execute("SELECT MAX(observed_at_utc) FROM weather_observations").fetchone()
    return row[0] if row else None


def _load_rows(conn: sqlite3.Connection, since: datetime) -> list[dict]:
    """Load observations newer than `since - margin` and parse them."""
    sql = (
        f"SELECT observed_at_utc, is_valid, {', '.join(AGG_FIELDS)} "
        "FROM weather_observations WHERE observed_at_utc >= ? ORDER BY observed_at_utc"
    )
    rows: list[dict] = []
    for raw in conn.execute(sql, (fmt_utc(since - SQL_MARGIN),)):
        try:
            ts = parse_utc(raw["observed_at_utc"])
        except (ValueError, TypeError):
            continue  # unparseable timestamp: excluded, surfaced nowhere (rare)
        rows.append(
            {
                "t": ts,
                "is_valid": bool(raw["is_valid"]),
                **{field: _to_float(raw[field]) for field in AGG_FIELDS},
            }
        )
    return rows


def _in_window(rows: list[dict], start: datetime, end: datetime) -> list[dict]:
    return [r for r in rows if start <= r["t"] <= end]


def _sum_rain(rows: list[dict]) -> float | None:
    """Sum rg1+rg2 over valid rows. None means 'no valid rows at all',
    which is distinct from 0.0 ('gauges present, no rain')."""
    vals = [
        (r["rg1"] or 0.0) + (r["rg2"] or 0.0)
        for r in rows
        if r["is_valid"]
    ]
    return round(sum(vals), 2) if vals else None


def _max_of(rows: list[dict], field: str) -> float | None:
    vals = [r[field] for r in rows if r["is_valid"] and r[field] is not None]
    return round(max(vals), 2) if vals else None


def _avg_of(rows: list[dict], field: str) -> float | None:
    vals = [r[field] for r in rows if r["is_valid"] and r[field] is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def _min_of(rows: list[dict], field: str) -> float | None:
    vals = [r[field] for r in rows if r["is_valid"] and r[field] is not None]
    return round(min(vals), 2) if vals else None


def _rain_days(rows: list[dict], rain_day_mm: float) -> int:
    per_day: dict = defaultdict(float)
    for r in rows:
        if r["is_valid"]:
            per_day[r["t"].date()] += (r["rg1"] or 0.0) + (r["rg2"] or 0.0)
    return sum(1 for total in per_day.values() if total >= rain_day_mm)


def _median_gap_seconds(rows: list[dict]) -> float:
    """Adaptive sampling-rate estimate (median inter-arrival in the 7d window),
    so coverage does not hardcode a 1-minute assumption."""
    times = sorted(r["t"] for r in rows)
    if len(times) < 2:
        return 60.0
    diffs = sorted((b - a).total_seconds() for a, b in zip(times, times[1:]) if b > a)
    if not diffs:
        return 60.0
    mid = len(diffs) // 2
    return diffs[mid] if len(diffs) % 2 else (diffs[mid - 1] + diffs[mid]) / 2.0


def _quality_metrics(rows_1h, rows_24h, rows_7d, window_end, at_utc, latest_dt) -> dict:
    gap_s = _median_gap_seconds(rows_7d)
    expected_24h = round(WINDOW_24H.total_seconds() / max(gap_s, 1.0)) + 1
    coverage = min(1.0, len(rows_24h) / max(1, expected_24h))

    completeness_vals = []
    for field in KEY_FIELDS:
        nonnull = sum(1 for r in rows_24h if r[field] is not None)
        completeness_vals.append(nonnull / len(rows_24h) if rows_24h else 0.0)
    completeness = sum(completeness_vals) / len(completeness_vals)

    invalid_ratio = (
        sum(1 for r in rows_24h if not r["is_valid"]) / len(rows_24h) if rows_24h else 0.0
    )
    staleness_minutes = max(0.0, (at_utc - window_end).total_seconds() / 60.0)

    return {
        "window_end_utc": fmt_utc(window_end),
        "evaluated_at_utc": fmt_utc(at_utc),
        "latest_observed_at_utc": fmt_utc(latest_dt) if latest_dt else None,
        "staleness_minutes": round(staleness_minutes, 1),
        "coverage_24h": round(coverage, 4),
        "completeness_24h": round(completeness, 4),
        "invalid_ratio_24h": round(invalid_ratio, 4),
        "sample_count_24h": len(rows_24h),
    }


def extract_features(
    conn: sqlite3.Connection,
    at_utc: datetime | None = None,
    now_utc: datetime | None = None,
    feature_cfg: dict | None = None,
) -> tuple[dict, dict]:
    """Compute the feature + quality dicts consumed by the risk engine.

    at_utc  -- evaluate windows "as of" this time (defaults to the latest obs).
    now_utc -- wall-clock override for staleness (used by tests).
    """
    cfg = feature_cfg or {}
    rain_day_mm = float(cfg.get("rain_day_mm", 1.0))
    ref_now = now_utc or utc_now()
    latest_iso = latest_observation_time(conn)
    if latest_iso is None:
        return {}, {"latest_observed_at_utc": None}

    latest_dt = parse_utc(latest_iso)
    # Evaluate windows ending at the newest data available at or before at_utc;
    # the remaining gap to at_utc is exactly the staleness.
    at = at_utc or ref_now
    window_end = min(at, latest_dt)

    rows = _load_rows(conn, window_end - WINDOW_7D)
    end = window_end
    rows_1h = _in_window(rows, end - WINDOW_1H, end)
    rows_24h = _in_window(rows, end - WINDOW_24H, end)
    rows_72h = _in_window(rows, end - WINDOW_72H, end)
    rows_7d = _in_window(rows, end - WINDOW_7D, end)

    features = {
        # rainfall (mm) — rg1 + rg2 tipping-bucket sums per window
        "rainfall_1h_mm": _sum_rain(rows_1h),
        "rainfall_24h_mm": _sum_rain(rows_24h),
        "rainfall_72h_mm": _sum_rain(rows_72h),
        "rain_days_7d": _rain_days(rows_7d, rain_day_mm),
        # temperature / humidity (SHT sensor)
        "temp_max_24h_c": _max_of(rows_24h, "temp_sht"),
        "temp_avg_24h_c": _avg_of(rows_24h, "temp_sht"),
        "humidity_min_24h_pct": _min_of(rows_24h, "humidity_sht"),
        "humidity_avg_24h_pct": _avg_of(rows_24h, "humidity_sht"),
        # wind — gust is the sensitive signal at this site (avg speed ~0-3 m/s)
        "wind_spd_max_24h_ms": _max_of(rows_24h, "wind_spd"),
        "wind_gust_max_24h_ms": _max_of(rows_24h, "wind_gust"),
        # extra context for transparency / future rules
        "heat_idx_max_24h_c": _max_of(rows_24h, "heat_idx"),
    }

    quality = _quality_metrics(rows_1h, rows_24h, rows_7d, window_end, at, latest_dt)
    return features, quality
