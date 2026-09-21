"""LLM integration package for MajiGuard's flexible advice layer.

Everything that connects an external large-language-model provider
(DeepSeek, OpenAI-compatible chat API) lives in this folder, deliberately
isolated from the deterministic risk engine:

    config.py    environment configuration (key, base URL, model, timeout)
    prompts.py   grounding system prompt + evaluation-context message builder
    client.py    thin HTTP client for /chat/completions (injectable for tests)
    advice.py    response parsing & strict validation (LLMAdvisorError)
    cache.py     llm_advice_cache table read/write (token-efficient reuse)
    service.py   generate_advice() orchestration: cache -> call -> fallback

Public API (re-exported here):
    load_llm_config, build_messages, parse_advice, generate_advice,
    LLMAdvisorError

Contract with the rest of the system:
* The rule engine stays the single source of truth for score / level /
  triggers.  This package can only rewrite the ADVICE layer.
* generate_advice never raises: it degrades to ``{"source": "error", ...}``
  or ``None`` (not configured), and callers fall back to the fixed templates.
"""
from .advice import LLMAdvisorError, parse_advice
from .config import load_llm_config
from .prompts import build_messages
from .service import generate_advice

__all__ = [
    "LLMAdvisorError",
    "build_messages",
    "generate_advice",
    "load_llm_config",
    "parse_advice",
]
