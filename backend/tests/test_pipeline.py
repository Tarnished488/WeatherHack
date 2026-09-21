"""End-to-end pipeline tests: extract -> engine -> risk_evaluations (step 5)."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from app.pipeline import NoDataError, run_evaluation
from tests.conftest import insert_obs

UTC = timezone.utc
END = datetime(2026, 9, 15, 12, 0, 0, tzinfo=UTC)


def fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def seed_dry_hot_week(conn) -> None:
    """7 days of hourly data: dry spell + hot afternoons + low humidity."""
    for h in range(24 * 7):
        t = END - timedelta(hours=h)
        hour = t.hour
        temp = 31.0 if 12 <= hour <= 16 else 20.0
        humidity = 35.0 if 12 <= hour <= 16 else 70.0
        gust = 11.0 if 13 <= hour <= 15 else 3.0
        insert_obs(conn, fmt(t), rg1=0.0, rg2=0.0, temp_sht=temp,
                   humidity_sht=humidity, wind_spd=1.5, wind_gust=gust)


def test_empty_db_raises(conn, thresholds):
    with pytest.raises(NoDataError):
        run_evaluation(conn, now_utc=END, thresholds=thresholds)


def test_pipeline_persists_evaluation(conn, thresholds):
    seed_dry_hot_week(conn)
    result = run_evaluation(conn, now_utc=END, thresholds=thresholds)

    # dry week + hot & dry afternoons + strong gusts -> high stress
    assert result["risk_score"] >= 60
    assert result["risk_level"] == "High"
    assert 0.0 <= result["confidence"] <= 1.0

    row = conn.execute(
        "SELECT * FROM risk_evaluations WHERE window_end_utc = ?",
        (result["window_end_utc"],),
    ).fetchone()
    assert row is not None
    assert row["risk_score"] == result["risk_score"]
    assert row["risk_level"] == result["risk_level"]
    assert row["confidence"] == result["confidence"]
    assert row["rules_version"] == thresholds["version"]
    triggers = json.loads(row["triggers_json"])
    assert {t["id"] for t in triggers} >= {"dry_72h", "dry_7d_baseline"}
    recs = json.loads(row["recommendations_json"])
    assert set(recs) == {"residents", "farmers", "managers"}
    features = json.loads(row["features_json"])
    assert features["features"]["rainfall_72h_mm"] == 0.0


def test_pipeline_rerun_is_idempotent(conn, thresholds):
    seed_dry_hot_week(conn)
    first = run_evaluation(conn, now_utc=END, thresholds=thresholds)
    second = run_evaluation(conn, now_utc=END, thresholds=thresholds)
    assert second == first
    count = conn.execute("SELECT COUNT(*) FROM risk_evaluations").fetchone()[0]
    assert count == 1


def test_stale_data_lowers_confidence(conn, thresholds):
    seed_dry_hot_week(conn)
    fresh = run_evaluation(conn, now_utc=END, thresholds=thresholds)
    later = run_evaluation(
        conn, now_utc=END + timedelta(minutes=800), thresholds=thresholds
    )
    assert later["confidence"] < fresh["confidence"]
    assert later["confidence"] <= thresholds["confidence"]["staleness_hard_cap"]
    assert any(t["id"] == "stale_data" for t in later["triggers"])


def test_rain_burst_end_to_end(conn, thresholds):
    # quiet week, then a short burst in the last hour
    for h in range(24 * 7):
        insert_obs(conn, fmt(END - timedelta(hours=h)), rg1=0.0, rg2=0.0,
                   temp_sht=20.0, humidity_sht=60.0, wind_spd=1.0)
    for i in range(1, 13):
        insert_obs(conn, fmt(END - timedelta(minutes=i)), rg1=0.5)

    result = run_evaluation(conn, now_utc=END, thresholds=thresholds)
    assert result["burst_alert"] is True
    assert result["risk_level"] == "Low"          # burst is not water stress
    assert any(t["id"] == "rain_burst_1h" for t in result["triggers"])
    row = conn.execute(
        "SELECT triggers_json FROM risk_evaluations WHERE window_end_utc = ?",
        (result["window_end_utc"],),
    ).fetchone()
    assert "rain_burst_1h" in row["triggers_json"]
