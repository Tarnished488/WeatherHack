"""Flexible LLM-powered advice on top of the explainable rule engine.

Design contract (important):

* The rule engine stays the single source of truth for the risk score, level,
  triggers and confidence.  Nothing here can change them.
* This module only enriches the ADVICE layer: it feeds the completed
  evaluation to DeepSeek (OpenAI-compatible chat API) and asks for
  situation-specific recommendations per role.
* Fixed templates from risk_thresholds.json remain the fallback.  Any
  problem - missing key, network error, bad JSON - degrades gracefully, so
  the product keeps working offline and no LLM output can corrupt results.
* Successful answers are cached in the ``llm_advice_cache`` table keyed by
  (rules_version, window_end_utc, model), so repeated dashboard calls do not
  spend tokens on an unchanged evaluation.

Configuration (environment variables, see .env.example):
    MAJIGUARD_DEEPSEEK_API_KEY        required to enable the layer
    MAJIGUARD_DEEPSEEK_BASE_URL       default https://api.deepseek.com
    MAJIGUARD_DEEPSEEK_MODEL          default deepseek-chat
    MAJIGUARD_LLM_TIMEOUT_SECONDS     default 30
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import httpx

from .engine import ROLES

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
DEFAULT_TIMEOUT_SECONDS = 30.0

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

_SYSTEM_PROMPT = """You are the advisory layer of MajiGuard, a community water-stress \
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


class LLMAdvisorError(ValueError):
    """Raised when the LLM response cannot be parsed into valid advice."""


def load_llm_config() -> dict:
    """Read the DeepSeek configuration from the environment."""
    api_key = (os.environ.get("MAJIGUARD_DEEPSEEK_API_KEY") or "").strip()
    return {
        "api_key": api_key,
        "base_url": (os.environ.get("MAJIGUARD_DEEPSEEK_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"),
        "model": (os.environ.get("MAJIGUARD_DEEPSEEK_MODEL") or DEFAULT_MODEL).strip(),
        "timeout_seconds": float(os.environ.get("MAJIGUARD_LLM_TIMEOUT_SECONDS") or DEFAULT_TIMEOUT_SECONDS),
        "enabled": bool(api_key),
    }


def ensure_cache_table(conn) -> None:
    """Create the advice cache table if missing (idempotent)."""
    conn.execute(LLM_ADVICE_CACHE_DDL)
    conn.commit()


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
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
    ]


def parse_advice(content: str) -> dict:
    """Validate the model output: one summary + short action list per role."""
    try:
        data = json.loads(content)
    except (TypeError, ValueError) as exc:
        raise LLMAdvisorError(f"advice is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise LLMAdvisorError("advice must be a JSON object")
    advice: dict[str, dict] = {}
    for role in ROLES:
        entry = data.get(role)
        if not isinstance(entry, dict):
            raise LLMAdvisorError(f"missing advice object for role {role!r}")
        summary = str(entry.get("summary") or "").strip()
        raw_actions = entry.get("actions")
        if not summary:
            raise LLMAdvisorError(f"role {role!r} needs a non-empty summary")
        if not isinstance(raw_actions, list):
            raise LLMAdvisorError(f"role {role!r} needs an 'actions' list")
        actions = [str(a).strip() for a in raw_actions if str(a).strip()][:4]
        if not actions:
            raise LLMAdvisorError(f"role {role!r} needs at least one action")
        advice[role] = {"summary": summary, "actions": actions}
    return advice


def _cache_key(rules_version: str, window_end_utc: str, model: str) -> str:
    return f"{rules_version}|{window_end_utc}|{model}"


def _read_cache(conn, key: str):
    row = conn.execute(
        "SELECT advice_json FROM llm_advice_cache WHERE cache_key = ?", (key,)
    ).fetchone()
    return json.loads(row["advice_json"]) if row else None


def _write_cache(conn, key: str, model: str, evaluation: dict, advice: dict) -> None:
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


def _call_llm(cfg: dict, evaluation: dict, client=None) -> dict:
    """POST the chat completion and parse the advice (raises on any problem)."""
    payload = {
        "model": cfg["model"],
        "messages": build_messages(evaluation),
        "temperature": 0.4,
        "max_tokens": 900,
        "stream": False,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {cfg['api_key']}", "Content-Type": "application/json"}
    url = f"{cfg['base_url']}/chat/completions"
    if client is not None:
        resp = client.post(url, json=payload, headers=headers)
    else:
        with httpx.Client(timeout=cfg["timeout_seconds"]) as http:
            resp = http.post(url, json=payload, headers=headers)
    resp.raise_for_status()
    body = resp.json()
    content = body["choices"][0]["message"]["content"]
    return parse_advice(content)


def generate_advice(conn, evaluation: dict, *, config: dict | None = None,
                    client=None, force_refresh: bool = False) -> dict | None:
    """Return flexible advice for the evaluation, or None when not configured.

    Returns one of:
      {"source": "llm",       "model": ..., "advice": {...}}   fresh generation
      {"source": "llm-cache", "model": ..., "advice": {...}}   served from cache
      {"source": "error",     "model": ..., "detail": ..., "advice": None}
      None                                                      layer disabled
    Any error degrades to the caller, which should fall back to the fixed
    templates - this function never raises.
    """
    cfg = config or load_llm_config()
    ensure_cache_table(conn)
    key = _cache_key(evaluation.get("rules_version", ""),
                     evaluation.get("window_end_utc", ""), cfg["model"])
    if not force_refresh:
        cached = _read_cache(conn, key)
        if cached is not None:
            return {"source": "llm-cache", "model": cfg["model"], "advice": cached}
    if not cfg.get("enabled"):
        return None
    try:
        advice = _call_llm(cfg, evaluation, client)
    except Exception as exc:  # network, HTTP status, schema, parsing - all degrade
        return {"source": "error", "model": cfg["model"],
                "detail": f"{type(exc).__name__}: {exc}", "advice": None}
    _write_cache(conn, key, cfg["model"], evaluation, advice)
    return {"source": "llm", "model": cfg["model"], "advice": advice}
