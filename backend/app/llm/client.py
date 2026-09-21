"""Thin HTTP client for the OpenAI-compatible chat-completions endpoint.

Kept separate from orchestration so tests can inject a fake ``client``
(anything with ``.post(url, json=..., headers=...)``) and never touch the
network.  The real path uses httpx with the configured timeout.
"""
from __future__ import annotations

import httpx


def call_chat_completion(cfg: dict, evaluation: dict, messages: list[dict], client=None) -> str:
    """POST /chat/completions and return the assistant message content.

    Raises on network errors, non-2xx status, or an unexpected response body;
    the caller (service.py) converts every failure into a graceful fallback.
    """
    payload = {
        "model": cfg["model"],
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": 900,
        "stream": False,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
    }
    url = f"{cfg['base_url']}/chat/completions"
    if client is not None:
        resp = client.post(url, json=payload, headers=headers)
    else:
        with httpx.Client(timeout=cfg["timeout_seconds"]) as http:
            resp = http.post(url, json=payload, headers=headers)
    resp.raise_for_status()
    body = resp.json()
    return body["choices"][0]["message"]["content"]
