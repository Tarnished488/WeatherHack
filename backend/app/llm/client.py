"""HTTP clients for the supported chat-provider protocols.

Three wire styles are implemented (see providers.py):

    openai     POST {base}/chat/completions            Bearer auth
    anthropic  POST {base}/v1/messages                 x-api-key auth
    gemini     POST {base}/v1beta/models/{m}:generateContent  x-goog-api-key

All three return the assistant's raw text content; JSON validation happens
in advice.py.  Tests inject a fake ``client`` (anything with
``.post(url, json=..., headers=...)``) so no test ever touches the network.

``classify_provider_error`` maps transport/HTTP failures onto stable
error kinds the API forwards to the UI (invalid key / no balance / rate
limit / timeout / generic).  Error details deliberately never include the
request headers, so the visitor's API key can never leak into a response
or log line.
"""
from __future__ import annotations

import httpx

ANTHROPIC_VERSION = "2023-06-01"


def _post(cfg: dict, url: str, json_body: dict, headers: dict, client=None):
    timeout = cfg.get("timeout_seconds", 30.0)
    if client is not None:
        return client.post(url, json=json_body, headers=headers)
    with httpx.Client(timeout=timeout) as http:
        return http.post(url, json=json_body, headers=headers)


def _call_openai(cfg: dict, messages: list[dict], client=None) -> str:
    url = f"{cfg['base_url']}/chat/completions"
    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
    }
    body = {
        "model": cfg["model"],
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": 900,
        "stream": False,
    }
    resp = _post(cfg, url, body, headers, client)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _call_anthropic(cfg: dict, messages: list[dict], client=None) -> str:
    system = "\n".join(m["content"] for m in messages if m["role"] == "system")
    user = "\n".join(m["content"] for m in messages if m["role"] != "system")
    url = f"{cfg['base_url']}/v1/messages"
    headers = {
        "x-api-key": cfg["api_key"],
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
    }
    body = {
        "model": cfg["model"],
        "max_tokens": 900,
        "temperature": 0.4,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    resp = _post(cfg, url, body, headers, client)
    resp.raise_for_status()
    blocks = resp.json().get("content", [])
    texts = [b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"]
    return "\n".join(t for t in texts if t)


def _call_gemini(cfg: dict, messages: list[dict], client=None) -> str:
    system = "\n".join(m["content"] for m in messages if m["role"] == "system")
    user = "\n".join(m["content"] for m in messages if m["role"] != "system")
    url = f"{cfg['base_url']}/v1beta/models/{cfg['model']}:generateContent"
    headers = {
        "x-goog-api-key": cfg["api_key"],
        "Content-Type": "application/json",
    }
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generation_config": {"temperature": 0.4, "max_output_tokens": 900},
    }
    resp = _post(cfg, url, body, headers, client)
    resp.raise_for_status()
    parts = resp.json()["candidates"][0]["content"]["parts"]
    return "\n".join(p.get("text", "") for p in parts if isinstance(p, dict) and p.get("text"))


def call_chat_completion(cfg: dict, evaluation: dict, messages: list[dict], client=None) -> str:
    """Dispatch on the provider style and return the assistant text.

    ``evaluation`` is accepted for interface compatibility with older tests;
    the prompt content is fully contained in ``messages``.
    """
    style = cfg.get("style", "openai")
    if style == "anthropic":
        return _call_anthropic(cfg, messages, client)
    if style == "gemini":
        return _call_gemini(cfg, messages, client)
    return _call_openai(cfg, messages, client)


def classify_provider_error(exc: Exception) -> dict:
    """Map a provider failure onto a stable error kind for the UI.

    Returns {"error_kind": ..., "detail": ...}.  ``detail`` contains only
    the exception type and, for HTTP errors, the status code - never the
    response body or any header - so the visitor's key cannot leak.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in (401, 403):
            kind = "invalid_api_key"
        elif status == 402:
            kind = "insufficient_balance"
        elif status == 429:
            # Most providers report exhausted quota/balance as 402; a plain
            # 429 is retryable throttling.  Google's OpenAI-compatible quota
            # errors surface here too, and the UI copy invites a retry.
            kind = "rate_limited"
        elif status == 400:
            # Gemini signals a bad key with 400 + "API key not valid" in the
            # body.  Reading the body is safe: the key travels in a header
            # and is never echoed by any provider error body.
            body = (exc.response.text or "")[:400].lower()
            if "api key" in body or "api_key" in body or "unregistered" in body:
                kind = "invalid_api_key"
            else:
                kind = "provider_error"
        else:
            kind = "provider_error"
        return {"error_kind": kind, "detail": f"HTTP {status}"}
    if isinstance(exc, httpx.TimeoutException):
        return {"error_kind": "timeout", "detail": "request timed out"}
    if isinstance(exc, httpx.HTTPError):
        return {"error_kind": "network_error", "detail": type(exc).__name__}
    return {"error_kind": "provider_error", "detail": type(exc).__name__}
