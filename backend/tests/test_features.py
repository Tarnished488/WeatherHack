"""Feature extraction tests (step 2 of the workflow)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.features import extract_features
from tests.conftest import insert_obs

UTC = timezone.utc
END = datetime(2026, 9, 15, 12, 0, 0, tzinfo=UTC)


def fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def seed_hourly(conn, hours: int, *, end: datetime = END, **fields) -> None:
    """Seed `hours` rows at 1-hour steps ending at `end`."""
    for h in range(hours):
        insert_obs(conn, fmt(end - timedelta(hours=h)), **fields)


def test_rainfall_windows_and_rain_days(conn, thresholds):
    seed_hourly(conn, 24 * 7, rg1=0.0, rg2=0.0, temp_sht=20.0,
                humidity_sht=60.0, wind_spd=1.0)
    # rain event just after the hourly row 2h before END: 10 tips x 0.2mm = 2.0mm
    # (start at minute 1 to avoid colliding with the seeded END-2h row)
    for i in range(1, 11):
        insert_obs(conn, fmt(END - timedelta(hours=2, minutes=i)), rg1=0.2)

    features, quality = extract_features(conn, at_utc=END,
                                         feature_cfg=thresholds["features"])
    assert features["rainfall_24h_mm"] == 2.0
    assert features["rainfall_72h_mm"] == 2.0
    assert features["rainfall_1h_mm"] == 0.0  # rows exist, no rain in the hour
    assert features["rain_days_7d"] == 1      # one UTC day totalled >= 1mm
    assert features["temp_max_24h_c"] == 20.0
    assert features["humidity_min_24h_pct"] == 60.0
    assert quality["window_end_utc"] == fmt(END)


def test_missing_window_yields_none_not_zero(conn, thresholds):
    # Rows 100h apart; evaluating mid-gap (at END-50h) leaves the 24h/72h
    # windows empty -> None ("no data"), distinct from 0.0 ("dry, data present").
    insert_obs(conn, fmt(END - timedelta(hours=200)), rg1=0.0, temp_sht=20.0)
    insert_obs(conn, fmt(END), rg1=0.0, temp_sht=20.0)
    features, quality = extract_features(conn, at_utc=END - timedelta(hours=50),
                                         feature_cfg=thresholds["features"])
    assert features["rainfall_24h_mm"] is None
    assert features["rainfall_72h_mm"] is None
    assert quality["window_end_utc"] == fmt(END - timedelta(hours=50))


def test_windows_end_at_latest_obs_when_data_is_old(conn, thresholds):
    # at_utc far ahead of the data: windows still end at the newest row and
    # the remaining gap is reported as staleness instead of empty windows.
    insert_obs(conn, fmt(END - timedelta(hours=100)), rg1=0.0, temp_sht=20.0)
    features, quality = extract_features(conn, at_utc=END,
                                         feature_cfg=thresholds["features"])
    assert features["rainfall_24h_mm"] == 0.0
    assert quality["staleness_minutes"] == 6000.0


def test_invalid_rows_excluded_from_aggregates(conn, thresholds):
    seed_hourly(conn, 25, rg1=0.0, temp_sht=20.0, humidity_sht=50.0, wind_spd=1.0)
    insert_obs(conn, fmt(END - timedelta(minutes=30)), temp_sht=45.0,
               humidity_sht=50.0, is_valid=0, flags=["temp_sht=45.0 out of range"])
    features, quality = extract_features(conn, at_utc=END,
                                         feature_cfg=thresholds["features"])
    assert features["temp_max_24h_c"] == 20.0       # invalid row ignored
    assert quality["invalid_ratio_24h"] > 0.0        # ...but counted for confidence


def test_quality_metrics_coverage_and_completeness(conn, thresholds):
    seed_hourly(conn, 24, rg1=0.0, rg2=0.0, temp_sht=20.0, wind_spd=1.0)  # humidity missing
    features, quality = extract_features(conn, at_utc=END,
                                         feature_cfg=thresholds["features"])
    # hourly sampling -> expected 25 rows in the 24h window, 24 present
    assert abs(quality["coverage_24h"] - 24 / 25) < 0.01
    # humidity missing everywhere -> 4 of 5 key fields present
    assert abs(quality["completeness_24h"] - 0.8) < 0.01
    assert features["humidity_min_24h_pct"] is None


def test_staleness_minutes(conn, thresholds):
    seed_hourly(conn, 3, rg1=0.0, temp_sht=20.0)
    features, quality = extract_features(
        conn, at_utc=END + timedelta(hours=3), now_utc=END + timedelta(hours=3),
        feature_cfg=thresholds["features"],
    )
    assert 179 <= quality["staleness_minutes"] <= 181
    assert quality["window_end_utc"] == fmt(END)
