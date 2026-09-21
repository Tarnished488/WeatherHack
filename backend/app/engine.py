"""Explainable rule-based risk engine (step 4 of the workflow).

All rules, weights, thresholds and recommendation templates live in
config/risk_thresholds.json (versioned) — this module only interprets them,
so the engine behaviour can be tuned without touching code.

Outputs per evaluation:
  - risk_score       0~100 (continuous weighted sensor-severity index)
  - risk_level       Low / Medium / High
  - confidence       0~1.0, penalised for gaps, invalid rows, staleness
  - triggers         every fired rule + data-quality alerts, with evidence
  - recommendations  action templates per audience (residents/farmers/managers)
"""
from __future__ import annotations

import operator

ROLES = ("residents", "farmers", "managers")
OPS = {
    "<=": operator.le,
    ">=": operator.ge,
    "<": operator.lt,
    ">": operator.gt,
    "==": operator.eq,
}


class EngineError(ValueError):
    """Raised when a rule/config cannot be interpreted."""


def _between(value: float, bounds) -> bool:
    lo, hi = float(bounds[0]), float(bounds[1])
    return lo <= value <= hi


def _condition_holds(cond: dict, features: dict) -> bool:
    value = features.get(cond["feature"])
    if value is None:
        # Missing feature can never fire a rule; the loss of confidence is
        # handled separately so behaviour stays transparent.
        return False
    op = cond["op"]
    if op == "between":
        return _between(value, cond["value"])
    fn = OPS.get(op)
    if fn is None:
        raise EngineError(f"Unsupported operator: {op!r}")
    return bool(fn(value, cond["value"]))


def rule_triggered(rule: dict, features: dict) -> bool:
    """A rule fires when ALL of its conditions hold."""
    return all(_condition_holds(cond, features) for cond in rule["conditions"])


def level_for_score(score: float, risk_levels: dict) -> str:
    if score <= risk_levels["low_max"]:
        return "Low"
    if score <= risk_levels["medium_max"]:
        return "Medium"
    return "High"


def compute_risk_score(features: dict, scoring_cfg: list[dict]) -> float:
    """Return a continuous 0-100 index from weighted sensor severities.

    Each component is linearly interpolated between its low-risk and high-risk
    sensor values, then clamped to 0..1. Missing components are excluded and
    the available weights are re-normalised; confidence separately reports the
    reduced evidence quality.
    """
    weighted_severity = 0.0
    available_weight = 0.0
    for component in scoring_cfg:
        value = features.get(component["feature"])
        if value is None:
            continue
        low_risk = float(component["low_risk_value"])
        high_risk = float(component["high_risk_value"])
        if high_risk == low_risk:
            raise EngineError(f"Scoring range cannot be zero: {component['id']}")
        severity = (float(value) - low_risk) / (high_risk - low_risk)
        severity = max(0.0, min(1.0, severity))
        weight = max(0.0, float(component["weight"]))
        weighted_severity += severity * weight
        available_weight += weight
    if available_weight == 0.0:
        return 0.0
    return round(weighted_severity / available_weight * 100.0, 1)


def compute_confidence(features: dict, quality: dict, ccfg: dict) -> float:
    """Confidence 0~1.0, start at 1.0 and subtract transparent penalties."""
    confidence = 1.0
    confidence -= (1.0 - quality["coverage_24h"]) * ccfg["coverage_penalty"]
    confidence -= quality["invalid_ratio_24h"] * ccfg["invalid_penalty"]
    confidence -= (1.0 - quality["completeness_24h"]) * ccfg["completeness_penalty"]

    stale = quality.get("staleness_minutes") or 0.0
    if stale > ccfg["staleness_warn_minutes"]:
        hours_over = (stale - ccfg["staleness_warn_minutes"]) / 60.0
        confidence -= min(
            hours_over * ccfg["staleness_penalty_per_hour"],
            ccfg["staleness_penalty_max"],
        )

    for feature in ccfg["critical_features"]:
        if features.get(feature) is None:
            confidence -= ccfg["critical_feature_penalty"]

    confidence = max(0.0, confidence)
    if stale > ccfg["staleness_hard_minutes"]:
        confidence = min(confidence, ccfg["staleness_hard_cap"])
    return round(confidence, 2)


def _quality_alerts(quality: dict, ccfg: dict) -> list[dict]:
    """Data-quality warnings shown alongside triggers (plan section 4.2)."""
    alerts: list[dict] = []
    stale = quality.get("staleness_minutes") or 0.0
    if stale > ccfg["staleness_warn_minutes"]:
        alerts.append(
            {
                "id": "stale_data",
                "scope": "quality",
                "weight": 0,
                "description": f"Latest observation is about {int(stale)} minutes old; data may be outdated",
                "observed": {"staleness_minutes": round(stale, 1)},
            }
        )
    if quality.get("invalid_ratio_24h", 0.0) > 0.05:
        alerts.append(
            {
                "id": "quality_flagged",
                "scope": "quality",
                "weight": 0,
                "description": "A significant share of observations in the past 24h were flagged as invalid",
                "observed": {"invalid_ratio_24h": quality["invalid_ratio_24h"]},
            }
        )
    if quality.get("coverage_24h", 1.0) < 0.5:
        alerts.append(
            {
                "id": "data_gap",
                "scope": "quality",
                "weight": 0,
                "description": "Observation coverage in the past 24h is low; possible data gap",
                "observed": {"coverage_24h": quality["coverage_24h"]},
            }
        )
    return alerts


def _merge_recommendations(level: str, triggered_rules: list[dict], thresholds: dict) -> dict:
    """Level-based templates first, then per-rule templates, deduplicated."""
    merged: dict[str, list[str]] = {role: [] for role in ROLES}
    level_recs = thresholds["level_recommendations"][level]
    for role in ROLES:
        if level_recs.get(role):
            merged[role].append(level_recs[role])
    for rule in triggered_rules:
        recs = rule.get("recommendations") or {}
        for role in ROLES:
            text = recs.get(role)
            if text and text not in merged[role]:
                merged[role].append(text)
    return merged


def evaluate(features: dict, quality: dict, thresholds: dict) -> dict:
    """Run all rules and assemble the full, explainable result."""
    triggers: list[dict] = []
    burst = False

    for rule in thresholds["rules"]:
        if not rule_triggered(rule, features):
            continue
        triggers.append(
            {
                "id": rule["id"],
                "scope": rule["scope"],
                "weight": rule["weight"],
                "description": rule["description"],
                "observed": {
                    cond["feature"]: features[cond["feature"]] for cond in rule["conditions"]
                },
                "recommendations": rule.get("recommendations", {}),
            }
        )
        if rule["scope"] == "burst":
            burst = True

    score = compute_risk_score(features, thresholds["continuous_scoring"])
    level = level_for_score(score, thresholds["risk_levels"])
    confidence = compute_confidence(features, quality, thresholds["confidence"])
    triggers.extend(_quality_alerts(quality, thresholds["confidence"]))

    stress_rules = [t for t in triggers if t["scope"] in ("stress", "burst")]
    return {
        "window_end_utc": quality["window_end_utc"],
        "evaluated_at_utc": quality["evaluated_at_utc"],
        "rules_version": thresholds["version"],
        "risk_score": score,
        "risk_level": level,
        "confidence": confidence,
        "burst_alert": burst,
        "triggers": triggers,
        "recommendations": _merge_recommendations(level, stress_rules, thresholds),
        "features": features,
        "quality": quality,
    }
