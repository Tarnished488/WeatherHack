"""Environment configuration for the flexible-advice LLM layer.

All settings come from environment variables (see backend/.env.example):

    MAJIGUARD_DEEPSEEK_API_KEY        required to enable the layer
    MAJIGUARD_DEEPSEEK_BASE_URL       default https://api.deepseek.com
    MAJIGUARD_DEEPSEEK_MODEL          default deepseek-chat
    MAJIGUARD_LLM_TIMEOUT_SECONDS     default 30

The provider is any OpenAI-compatible chat service; pointing
MAJIGUARD_DEEPSEEK_BASE_URL at another provider is a config change only.
"""
from __future__ import annotations

import os

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
DEFAULT_TIMEOUT_SECONDS = 30.0


def load_llm_config() -> dict:
    """Read the provider configuration; ``enabled`` is True only with a key."""
    api_key = (os.environ.get("MAJIGUARD_DEEPSEEK_API_KEY") or "").strip()
    return {
        "api_key": api_key,
        "base_url": (os.environ.get("MAJIGUARD_DEEPSEEK_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"),
        "model": (os.environ.get("MAJIGUARD_DEEPSEEK_MODEL") or DEFAULT_MODEL).strip(),
        "timeout_seconds": float(os.environ.get("MAJIGUARD_LLM_TIMEOUT_SECONDS") or DEFAULT_TIMEOUT_SECONDS),
        "enabled": bool(api_key),
    }
