"""Orchestration for the flexible-advice layer: cache -> call -> fallback.

``generate_advice`` is the single entry point used by the API.  It never
raises; every failure degrades to a structured result the caller maps onto
the fixed rule-engine templates:

    {"source": "llm",       "model": ..., "advice": {...}}    fresh generation
    {"source": "llm-cache", "model": ..., "advice": {...}}    served from cache
    {"source": "error",     "model": ..., "detail": ..., "advice": None}
    None                                                        layer disabled
"""
from __future__ import annotations

from .advice import parse_advice
from .cache import cache_key, ensure_cache_table, read_cache, write_cache
from .client import call_chat_completion
from .config import load_llm_config
from .prompts import build_messages


def generate_advice(conn, evaluation: dict, *, config: dict | None = None,
                    client=None, force_refresh: bool = False) -> dict | None:
    """Return flexible LLM advice for a completed rule-engine evaluation.

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
        return {"source": "error", "model": cfg["model"],
                "detail": f"{type(exc).__name__}: {exc}", "advice": None}
    write_cache(conn, key, cfg["model"], evaluation, advice)
    return {"source": "llm", "model": cfg["model"], "advice": advice}
