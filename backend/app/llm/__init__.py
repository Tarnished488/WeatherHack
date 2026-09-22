"""LLM integration package for MajiGuard's flexible advice layer.

Everything that connects external large-language-model providers lives in
this folder, deliberately isolated from the deterministic risk engine:

    config.py     environment configuration for the team's demo key (GET path)
    providers.py  bring-your-own-key provider registry (6 providers, 3 protocols)
    prompts.py    grounding system prompt + evaluation-context message builder
    client.py     protocol dispatch (openai / anthropic / gemini) + error mapping
    advice.py     response extraction & strict validation (LLMAdvisorError)
    cache.py      llm_advice_cache table read/write (server-key path only)
    service.py    generate_advice() and generate_advice_byok() orchestration

Public API (re-exported here):
    load_llm_config, build_messages, parse_advice, generate_advice,
    generate_advice_byok, get_provider, public_provider_list, LLMAdvisorError

Contract with the rest of the system:
* The rule engine stays the single source of truth for score / level /
  triggers.  This package can only rewrite the ADVICE layer.
* generate_advice never raises: it degrades to ``{"source": "error", ...}``
  or ``None`` (not configured), and callers fall back to the fixed templates.
* generate_advice_byok never raises either: provider failures come back as
  ``{"source": "error", "error_kind": ..., "error_message": ...}`` for the
  UI to render (invalid key / insufficient balance / rate limit / ...).
* Visitor API keys live in memory for one request only - never logged,
  never cached, never persisted.
"""
from .advice import LLMAdvisorError, extract_json_object, parse_advice
from .config import load_llm_config
from .prompts import build_messages
from .providers import PROVIDER_IDS, get_provider, public_provider_list
from .service import generate_advice, generate_advice_byok

__all__ = [
    "LLMAdvisorError",
    "PROVIDER_IDS",
    "build_messages",
    "extract_json_object",
    "generate_advice",
    "generate_advice_byok",
    "get_provider",
    "load_llm_config",
    "parse_advice",
    "public_provider_list",
]
