"""Prompt construction for the flexible-advice layer.

The system prompt is a strict contract: the model may only use the facts in
the evaluation context, may not change score/level/confidence, may not leave
the water-guidance scope, and must answer with JSON matching the exact schema
the parser (advice.py) validates.  The user message carries the compact JSON
context of the completed rule-engine evaluation.
"""
from __future__ import annotations

import json

SYSTEM_PROMPT = """You are the advisory layer of MajiGuard, a community water-stress \
early-warning prototype for the JKUAT site (Kiambu, Kenya). A deterministic rule engine \
has already computed the risk score, risk level and triggered rules. Your only job is to \
make the ADVICE flexible and specific to the current situation.

Hard rules you must never break:
1. Use ONLY the facts in the JSON context. Never invent measurements, forecasts or trends that are not present.
2. Never change or re-interpret the risk score, level or confidence, and never add hazards the triggers do not support.
3. Stay inside the project scope: water-use and preparedness guidance only. No medical, drinking-water-safety or flood-forecast claims.
4. Be concrete and prudent, in short sentences suited to SMS or community notices.
5. Respond with JSON only - no markdown, no explanations - matching exactly:
{"residents": {"summary": "...", "actions": ["...", "..."]},
 "farmers": {"summary": "...", "actions": ["...", "..."]},
 "managers": {"summary": "...", "actions": ["...", "..."]}}
Each role gets exactly one summary sentence and 2-3 short actions."""


def build_messages(evaluation: dict) -> list[dict]:
    """Ground the model: system contract + compact JSON evaluation context."""
    triggers = [
        {
            "id": t.get("id"),
            "scope": t.get("scope"),
            "description": t.get("description"),
            "observed": t.get("observed"),
        }
        for t in evaluation.get("triggers", [])
        if t.get("scope") in ("stress", "burst")
    ]
    features = {k: v for k, v in (evaluation.get("features") or {}).items() if v is not None}
    quality = evaluation.get("quality") or {}
    context = {
        "risk_score": evaluation.get("risk_score"),
        "risk_level": evaluation.get("risk_level"),
        "confidence": evaluation.get("confidence"),
        "burst_alert": bool(evaluation.get("burst_alert", False)),
        "rules_version": evaluation.get("rules_version"),
        "quality": {
            "coverage_24h": quality.get("coverage_24h"),
            "invalid_ratio_24h": quality.get("invalid_ratio_24h"),
            "completeness_24h": quality.get("completeness_24h"),
            "staleness_minutes": quality.get("staleness_minutes"),
        },
        "observed_features": features,
        "triggered_rules": triggers,
        "template_recommendations": evaluation.get("recommendations") or {},
    }
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
    ]
