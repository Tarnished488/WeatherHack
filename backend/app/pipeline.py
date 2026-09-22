"""Risk evaluation pipeline (steps 1-5 of the workflow).

    weather_observations ──> extract key fields ──> aggregate features
        ──> match thresholds (risk_thresholds.json) ──> risk engine
        ──> persist to risk_evaluations

CLI:
    python -m app.pipeline                 # evaluate latest data
    python -m app.pipeline --at 2026-09-01T00:00:00Z
    python -m app.pipeline --db data/majiguard.db
"""
from __future__ import annotations

import argparse
import json
import sqlite3

from .config import DEFAULT_THRESHOLD_PATH, load_thresholds
from .db import DEFAULT_DB_PATH, connect, ensure_schema
from .engine import evaluate
from .features import extract_features, fmt_utc, latest_observation_time, parse_utc, utc_now


class NoDataError(RuntimeError):
    """Raised when weather_observations contains no rows to evaluate."""


def run_evaluation(
    conn: sqlite3.Connection,
    at_utc=None,
    now_utc=None,
    thresholds: dict | None = None,
) -> dict:
    """Evaluate the current risk once and persist it (idempotent)."""
    ensure_schema(conn)
    cfg = thresholds or load_thresholds()

    latest_iso = latest_observation_time(conn)
    if latest_iso is None:
        raise NoDataError(
            "weather_observations is empty - run `python -m app.ingest --source <csv>` first"
        )

    # Step 1+2: extract key fields & aggregate features.
    features, quality = extract_features(
        conn, at_utc=at_utc, now_utc=now_utc, feature_cfg=cfg.get("features", {})
    )
    # Step 3+4: match thresholds and run the rule engine.
    result = evaluate(features, quality, cfg)
    result["evaluated_at_utc"] = fmt_utc(now_utc or utc_now())

    # Step 5: persist (upsert on window_end + rules version => re-runs are safe).
    _persist(conn, result)
    return result


def run_daily_evaluations(
    conn: sqlite3.Connection,
    start_utc=None,
    end_utc=None,
    thresholds: dict | None = None,
) -> list[dict]:
    """Calculate and persist one risk result for every calendar day with data.

    Each day is evaluated at its final observation. Historical calculations are
    therefore isolated from observations that arrived on later days.
    """
    ensure_schema(conn)
    clauses: list[str] = []
    params: list[str] = []
    if start_utc is not None:
        clauses.append("observed_at_utc >= ?")
        params.append(fmt_utc(start_utc))
    if end_utc is not None:
        clauses.append("observed_at_utc <= ?")
        params.append(fmt_utc(end_utc))
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = conn.execute(
        "SELECT substr(observed_at_utc, 1, 10) AS observation_day, "
        "MAX(observed_at_utc) AS day_end_utc "
        f"FROM weather_observations {where} "
        "GROUP BY observation_day ORDER BY observation_day",
        params,
    ).fetchall()

    cfg = thresholds or load_thresholds()
    results: list[dict] = []
    for row in rows:
        day_end = parse_utc(row["day_end_utc"])
        results.append(
            run_evaluation(
                conn,
                at_utc=day_end,
                now_utc=day_end,
                thresholds=cfg,
            )
        )
    return results


def _persist(conn: sqlite3.Connection, result: dict) -> None:
    conn.execute(
        """
        INSERT INTO risk_evaluations (
            window_end_utc, evaluated_at_utc, rules_version,
            risk_score, risk_level, confidence,
            triggers_json, recommendations_json, features_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(window_end_utc, rules_version) DO UPDATE SET
            evaluated_at_utc     = excluded.evaluated_at_utc,
            risk_score           = excluded.risk_score,
            risk_level           = excluded.risk_level,
            confidence           = excluded.confidence,
            triggers_json        = excluded.triggers_json,
            recommendations_json = excluded.recommendations_json,
            features_json        = excluded.features_json
        """,
        (
            result["window_end_utc"],
            result["evaluated_at_utc"],
            result["rules_version"],
            result["risk_score"],
            result["risk_level"],
            result["confidence"],
            json.dumps(result["triggers"], ensure_ascii=False),
            json.dumps(result["recommendations"], ensure_ascii=False),
            json.dumps({"features": result["features"], "quality": result["quality"]},
                       ensure_ascii=False),
        ),
    )
    conn.commit()


def _print_summary(result: dict) -> None:
    summary = {
        "window_end_utc": result["window_end_utc"],
        "evaluated_at_utc": result["evaluated_at_utc"],
        "rules_version": result["rules_version"],
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "confidence": result["confidence"],
        "burst_alert": result["burst_alert"],
        "triggers": [
            {"id": t["id"], "description": t["description"], "observed": t["observed"]}
            for t in result["triggers"]
        ],
        "recommendations": result["recommendations"],
        "key_features": {
            k: result["features"][k]
            for k in (
                "rainfall_1h_mm",
                "rainfall_24h_mm",
                "rainfall_72h_mm",
                "rain_days_7d",
                "temp_max_24h_c",
                "humidity_min_24h_pct",
                "wind_gust_max_24h_ms",
            )
        },
        "quality": {
            k: result["quality"][k]
            for k in (
                "staleness_minutes",
                "coverage_24h",
                "completeness_24h",
                "invalid_ratio_24h",
            )
        },
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the MajiGuard risk evaluation pipeline")
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    parser.add_argument("--at", default=None, help="Evaluate as-of this UTC time (ISO 8601)")
    parser.add_argument("--thresholds", default=str(DEFAULT_THRESHOLD_PATH),
                        help="Path to risk_thresholds.json")
    args = parser.parse_args(argv)

    at_utc = None
    if args.at:
        from .features import parse_utc

        at_utc = parse_utc(args.at)

    conn = connect(args.db)
    try:
        result = run_evaluation(
            conn, at_utc=at_utc, thresholds=load_thresholds(args.thresholds)
        )
    finally:
        conn.close()

    _print_summary(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
