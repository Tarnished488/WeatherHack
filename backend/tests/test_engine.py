"""Risk engine tests (step 4): rule firing, scoring, level, confidence."""
from __future__ import annotations

from app.engine import compute_confidence, evaluate, level_for_score

# A feature set that fires nothing (mild conditions).
BASE_FEATURES = {
    "rainfall_1h_mm": 0.0,
    "rainfall_24h_mm": 0.0,
    "rainfall_72h_mm": 5.0,
    "rain_days_7d": 3,
    "temp_max_24h_c": 25.0,
    "temp_avg_24h_c": 18.0,
    "humidity_min_24h_pct": 50.0,
    "humidity_avg_24h_pct": 65.0,
    "wind_spd_max_24h_ms": 2.0,
    "wind_gust_max_24h_ms": 4.0,
    "heat_idx_max_24h_c": 24.0,
}

BASE_QUALITY = {
    "window_end_utc": "2026-09-15T12:00:00Z",
    "evaluated_at_utc": "2026-09-15T12:00:00Z",
    "latest_observed_at_utc": "2026-09-15T12:00:00Z",
    "staleness_minutes": 0.0,
    "coverage_24h": 1.0,
    "completeness_24h": 1.0,
    "invalid_ratio_24h": 0.0,
    "sample_count_24h": 1440,
}


def test_untriggered_conditions_still_get_continuous_score(thresholds):
    result = evaluate(BASE_FEATURES, BASE_QUALITY, thresholds)
    assert result["risk_score"] == 52.6
    assert result["risk_level"] == "Medium"
    assert result["confidence"] == 1.0
    assert result["triggers"] == []
    # level recommendations always present for all audiences
    assert set(result["recommendations"]) == {"residents", "farmers", "managers"}
    assert all(result["recommendations"].values())


def test_dry_spell_increases_continuous_score(thresholds):
    features = {**BASE_FEATURES, "rainfall_72h_mm": 1.0, "rain_days_7d": 0}
    result = evaluate(features, BASE_QUALITY, thresholds)
    ids = {t["id"] for t in result["triggers"]}
    assert {"dry_72h", "dry_7d_baseline"} <= ids
    assert result["risk_score"] == 68.0
    assert result["risk_level"] == "High"
    assert result["risk_score"] > evaluate(BASE_FEATURES, BASE_QUALITY, thresholds)["risk_score"]


def test_dry_72h_boundary_is_inclusive(thresholds):
    features = {**BASE_FEATURES, "rainfall_72h_mm": 2.0}
    assert any(t["id"] == "dry_72h" for t in evaluate(features, BASE_QUALITY, thresholds)["triggers"])
    features = {**BASE_FEATURES, "rainfall_72h_mm": 2.01}
    assert not any(t["id"] == "dry_72h" for t in evaluate(features, BASE_QUALITY, thresholds)["triggers"])


def test_high_risk_combo(thresholds):
    features = {
        **BASE_FEATURES,
        "rainfall_72h_mm": 0.0,
        "rain_days_7d": 0,
        "temp_max_24h_c": 35.0,
        "humidity_min_24h_pct": 30.0,
        "wind_gust_max_24h_ms": 12.0,
    }
    result = evaluate(features, BASE_QUALITY, thresholds)
    assert result["risk_score"] == 100.0
    assert result["risk_level"] == "High"


def test_rain_burst_is_preparedness_not_stress(thresholds):
    features = {**BASE_FEATURES, "rainfall_1h_mm": 6.0}
    result = evaluate(features, BASE_QUALITY, thresholds)
    burst = [t for t in result["triggers"] if t["id"] == "rain_burst_1h"]
    assert burst and burst[0]["scope"] == "burst"
    assert result["burst_alert"] is True
    assert result["risk_score"] == 52.6         # burst itself adds no score
    assert result["risk_level"] == "Medium"
    # burst recommendation propagated to all audiences
    assert any("storage" in r or "drainage" in r for r in result["recommendations"]["managers"])


def test_missing_features_never_fire_rules(thresholds):
    result = evaluate({}, {**BASE_QUALITY, "coverage_24h": 0.0,
                           "completeness_24h": 0.0}, thresholds)
    assert result["risk_score"] == 0
    assert not [t for t in result["triggers"] if t["scope"] == "stress"]


def test_level_boundaries(thresholds):
    levels = thresholds["risk_levels"]
    assert level_for_score(levels["low_max"], levels) == "Low"
    assert level_for_score(levels["low_max"] + 1, levels) == "Medium"
    assert level_for_score(levels["medium_max"], levels) == "Medium"
    assert level_for_score(levels["medium_max"] + 1, levels) == "High"


def test_confidence_penalties(thresholds):
    ccfg = thresholds["confidence"]
    assert compute_confidence(BASE_FEATURES, BASE_QUALITY, ccfg) == 1.0
    # 50% invalid rows -> -0.25
    q = {**BASE_QUALITY, "invalid_ratio_24h": 0.5}
    assert compute_confidence(BASE_FEATURES, q, ccfg) == 0.75
    # 50% coverage -> -0.15
    q = {**BASE_QUALITY, "coverage_24h": 0.5}
    assert compute_confidence(BASE_FEATURES, q, ccfg) == 0.85
    # 4h stale (2h beyond warn) -> -0.2
    q = {**BASE_QUALITY, "staleness_minutes": 240.0}
    assert compute_confidence(BASE_FEATURES, q, ccfg) == 0.8
    # missing critical rainfall features -> -0.15 each
    features = {k: v for k, v in BASE_FEATURES.items()
                if k not in ("rainfall_24h_mm", "rainfall_72h_mm")}
    assert compute_confidence(features, BASE_QUALITY, ccfg) == 0.7


def test_confidence_hard_cap_on_very_stale_data(thresholds):
    ccfg = thresholds["confidence"]
    q = {**BASE_QUALITY, "staleness_minutes": 800.0}  # > hard limit (720)
    assert compute_confidence(BASE_FEATURES, q, ccfg) == ccfg["staleness_hard_cap"]


def test_quality_alerts_added_to_triggers(thresholds):
    q = {**BASE_QUALITY, "staleness_minutes": 200.0, "invalid_ratio_24h": 0.2,
         "coverage_24h": 0.3}
    result = evaluate(BASE_FEATURES, q, thresholds)
    ids = {t["id"] for t in result["triggers"]}
    assert {"stale_data", "quality_flagged", "data_gap"} <= ids
    assert result["confidence"] < 1.0
