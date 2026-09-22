"""Environment configuration for the flexible-advice LLM layer.

Settings come from environment variables (see backend/.env.example):

    MAJIGUARD_DEEPSEEK_API_KEY        see DEMO_API_KEY below (empty = disabled)
    MAJIGUARD_DEEPSEEK_BASE_URL       default https://api.deepseek.com
    MAJIGUARD_DEEPSEEK_MODEL          default deepseek-chat
    MAJIGUARD_LLM_TIMEOUT_SECONDS     default 30

The provider is any OpenAI-compatible chat service; pointing
MAJIGUARD_DEEPSEEK_BASE_URL at another provider is a config change only.

=== FOR THE TEAMMATE TAKING OVER THIS LAYER ==============================

Visitors never type an API key: the AI advice on the dashboard is generated
server-side with the key configured here.  To enable the AI advice:

  1. Put your provider key into DEMO_API_KEY below (or, without touching
     code, export the MAJIGUARD_DEEPSEEK_API_KEY environment variable before
     starting the backend).
  2. To use a different OpenAI-compatible provider, change
     MAJIGUARD_DEEPSEEK_BASE_URL and MAJIGUARD_DEEPSEEK_MODEL (env vars) —
     e.g. base_url https://api.deepseek.com + model deepseek-chat for
     DeepSeek, or base_url https://api.openai.com/v1 + model gpt-4o-mini.
  3. Restart the backend.  While the key is empty the endpoint honestly
     serves the fixed rule-engine templates instead (enabled: false).

Never commit a real key to the repository — prefer the environment variable
on the deployment machine.
==========================================================================
"""
from __future__ import annotations

import os

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
DEFAULT_TIMEOUT_SECONDS = 30.0

# >>> TEAMMATE: paste your provider API key here to enable the AI advice. <<<
# Keep it empty for the public repo; the dashboard falls back to the fixed
# rule-engine templates until a key is provided.
DEMO_API_KEY = ""


def load_llm_config() -> dict:
    """Read the provider configuration; ``enabled`` is True only with a key."""
    api_key = (os.environ.get("MAJIGUARD_DEEPSEEK_API_KEY") or DEMO_API_KEY).strip()
    return {
        "api_key": api_key,
        "base_url": (os.environ.get("MAJIGUARD_DEEPSEEK_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"),
        "model": (os.environ.get("MAJIGUARD_DEEPSEEK_MODEL") or DEFAULT_MODEL).strip(),
        "timeout_seconds": float(os.environ.get("MAJIGUARD_LLM_TIMEOUT_SECONDS") or DEFAULT_TIMEOUT_SECONDS),
        "enabled": bool(api_key),
    }
