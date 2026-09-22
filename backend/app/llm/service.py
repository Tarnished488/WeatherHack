"""Orchestration for the flexible-advice layer: cache -> call -> fallback.

Two entry points:

``generate_advice`` (GET /api/llm-advice)
    Uses the optional server-side key from environment variables.  Results
    are cached per (rules_version, window_end_utc, model) so the dashboard
    can poll without re-spending the team's tokens.  It never raises; every
    failure degrades to a structured result the caller maps onto the fixed
    rule-engine templates.

``generate_advice_byok`` (POST /api/llm-advice)
    Bring-your-own-key path for a public deployment: the visitor picks a
    provider and supplies their own API key for that single request.  The
    key lives in memory only - it is never cached, logged, or persisted -
    and generated advice is deliberately NOT written to the shared cache
    (it belongs to the visitor, not to the deployment).

Both return dicts the API maps onto responses; neither raises.
"""
from __future__ import annotations

from .advice import parse_advice
from .cache import cache_key, ensure_cache_table, read_cache, write_cache
from .client import call_chat_completion, classify_provider_error
from .config import load_llm_config
from .prompts import build_messages
from .providers import get_provider

# Stable, frontend-mappable copy for each error kind.  The API returns the
# kind plus this English message; the UI renders its own localized text.
ERROR_MESSAGES = {
    "invalid_api_key": "Unknown or invalid API key for {provider}. Please check the key and try again.",
    "insufficient_balance": "Insufficient balance or quota on your {provider} account. Please top up or pick another provider.",
    "rate_limited": "{provider} is rate-limiting requests right now. Please retry in a moment.",
    "timeout": "The request to {provider} timed out. Please retry.",
    "network_error": "Could not reach {provider}. Check your network and retry.",
    "provider_error": "{provider} returned an unexpected error. Please retry later.",
    "bad_response": "{provider} returned a response MajiGuard could not use.",
}


def generate_advice(conn, evaluation: dict, *, config: dict | None = None,
                    client=None, force_refresh: bool = False) -> dict | None:
    """Return flexible LLM advice using the server-side configuration.

    Returns None when the layer is not configured (no API key); callers
    should then serve the fixed templates.
    """
    cfg = config or load_llm_config()
    ensure_cache_table(conn)
    key = cache_key(evaluation.get("rules_version", ""),
                    evaluation.get("window_end_utc", ""), cfg["model"])
    if not force_refresh:
        cached = read_cache(conn, key)
        if cached is not None:
            return {"source": "llm-cache", "model": cfg["model"], "advice": cached}
    if not cfg.get("enabled"):
        return None
    try:
        content = call_chat_completion(cfg, evaluation, build_messages(evaluation), client)
        advice = parse_advice(content)
    except Exception as exc:  # network, HTTP status, schema, parsing - all degrade
        info = classify_provider_error(exc)
        return {"source": "error", "model": cfg["model"],
                "error_kind": info["error_kind"],
                "detail": f"{type(exc).__name__}: {exc}", "advice": None}
    write_cache(conn, key, cfg["model"], evaluation, advice)
    return {"source": "llm", "model": cfg["model"], "advice": advice}


def generate_advice_byok(conn, evaluation: dict, provider_id: str, api_key: str,
                         model: str | None = None, client=None) -> dict:
    """Return flexible LLM advice generated with a visitor-supplied key.

    The rule engine stays authoritative; this only rewrites the advice
    layer, exactly like the server-key path.  Results are intentionally
    not cached (shared database, per-visitor keys).  Never raises.
    """
    provider = get_provider(provider_id)  # validated by the API layer first
    cfg = {
        "provider": provider_id,
        "label": provider["label"],
        "style": provider["style"],
        "base_url": provider["base_url"],
        "model": (model or "").strip() or provider["default_model"],
        "api_key": api_key.strip(),
        "timeout_seconds": 30.0,
        "enabled": True,
    }
    try:
        content = call_chat_completion(cfg, evaluation, build_messages(evaluation), client)
        advice = parse_advice(content)
    except Exception as exc:  # noqa: BLE001 - every failure becomes an error payload
        info = classify_provider_error(exc)
        return {
            "source": "error",
            "provider": provider_id,
            "provider_label": provider["label"],
            "model": cfg["model"],
            "error_kind": info["error_kind"],
            "error_message": ERROR_MESSAGES[info["error_kind"]].format(provider=provider["label"]),
            "detail": info["detail"],
            "advice": None,
        }
    return {
        "source": "llm",
        "provider": provider_id,
        "provider_label": provider["label"],
        "model": cfg["model"],
        "advice": advice,
    }
