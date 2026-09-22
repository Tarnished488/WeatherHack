"""Provider registry for bring-your-own-key (BYOK) LLM advice.

MajiGuard is a public project: the server never ships with a provider key
that visitors could silently reuse.  Instead, every visitor supplies their
own API key per request (POST /api/llm-advice) and picks one of the
supported providers below.  The team may still configure a server-side
DeepSeek key via environment variables for the demo GET endpoint; that
path is separate (see config.py / service.py).

Each registry entry describes:
    label          human-readable provider name (shown in the UI / errors)
    style          wire protocol spoken by client.py:
                     "openai"    POST {base}/chat/completions, Bearer auth
                     "anthropic" POST {base}/v1/messages, x-api-key auth
                     "gemini"    POST {base}/v1beta/models/{model}:generateContent
    base_url       provider API root (no trailing slash)
    default_model  fallback chat model when the visitor does not pick one

Keys are only ever held in memory for the duration of one request and are
never logged, cached, or persisted.
"""
from __future__ import annotations

PROVIDERS: dict[str, dict] = {
    "chatgpt": {
        "label": "ChatGPT (OpenAI)",
        "style": "openai",
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "key_hint": "sk-...",
    },
    "grok": {
        "label": "Grok (xAI)",
        "style": "openai",
        "base_url": "https://api.x.ai/v1",
        "default_model": "grok-3-mini",
        "key_hint": "xai-...",
    },
    "gemini": {
        "label": "Gemini (Google)",
        "style": "gemini",
        "base_url": "https://generativelanguage.googleapis.com",
        "default_model": "gemini-2.0-flash",
        "key_hint": "AIza...",
    },
    "claude": {
        "label": "Claude (Anthropic)",
        "style": "anthropic",
        "base_url": "https://api.anthropic.com",
        "default_model": "claude-3-5-haiku-latest",
        "key_hint": "sk-ant-...",
    },
    "deepseek": {
        "label": "DeepSeek",
        "style": "openai",
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-chat",
        "key_hint": "sk-...",
    },
    "glm": {
        "label": "GLM (Zhipu)",
        "style": "openai",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-flash",
        "key_hint": "xxxxx.yyyy",
    },
}

# Stable, UI-ready list order for dropdowns.
PROVIDER_IDS: list[str] = ["chatgpt", "grok", "gemini", "claude", "deepseek", "glm"]


def get_provider(provider_id: str) -> dict:
    """Return the registry entry or raise KeyError for an unknown id."""
    try:
        return PROVIDERS[provider_id.strip().lower()]
    except KeyError as exc:
        raise KeyError(
            f"unknown provider {provider_id!r}; choose one of {PROVIDER_IDS}"
        ) from exc


def public_provider_list() -> list[dict]:
    """Shape returned to the frontend for the model picker."""
    return [
        {
            "id": pid,
            "label": PROVIDERS[pid]["label"],
            "default_model": PROVIDERS[pid]["default_model"],
            "key_hint": PROVIDERS[pid]["key_hint"],
        }
        for pid in PROVIDER_IDS
    ]
