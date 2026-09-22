"""Authenticated Conduit POST client.

The endpoint URL is public (official Conduit docs) and defaults to
https://conduit.jhubafrica.com/data.php; override it with the
MAJIGUARD_CONDUIT_ENDPOINT environment variable if it ever moves.
The API key and team email are secrets and are read ONLY from environment
variables (MAJIGUARD_CONDUIT_API_KEY, MAJIGUARD_CONDUIT_EMAIL) — they are
never hardcoded or committed.  This module is used by the backend refresh
service; the browser never sees the credentials.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DEFAULT_ENDPOINT = "https://conduit.jhubafrica.com/data.php"


class ConduitClientError(RuntimeError):
    """A recoverable Conduit configuration, network, or response error."""


@dataclass(frozen=True)
class ConduitPayload:
    payload: dict
    source: str


def _required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConduitClientError(f"Missing required environment variable: {name}")
    return value


def fetch_conduit_payload(fromdate: str, todate: str, timeout_seconds: float = 30.0) -> ConduitPayload:
    """POST a date range to Conduit and return its JSON body.

    Required environment variables:
    MAJIGUARD_CONDUIT_API_KEY, MAJIGUARD_CONDUIT_EMAIL.
    Optional: MAJIGUARD_CONDUIT_ENDPOINT (defaults to the official URL).
    """
    if fromdate > todate:
        raise ConduitClientError("fromdate cannot be later than todate")
    if timeout_seconds <= 0:
        raise ConduitClientError("timeout_seconds must be greater than zero")

    endpoint = (os.environ.get("MAJIGUARD_CONDUIT_ENDPOINT") or DEFAULT_ENDPOINT).strip()
    form_data = urlencode({
        "apikey": _required_env("MAJIGUARD_CONDUIT_API_KEY"),
        "email": _required_env("MAJIGUARD_CONDUIT_EMAIL"),
        "fromdate": fromdate,
        "todate": todate,
    }).encode("utf-8")
    request = Request(
        endpoint,
        data=form_data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "MajiGuard/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read()
    except HTTPError as exc:
        raise ConduitClientError(f"Conduit API returned HTTP {exc.code}") from exc
    except URLError as exc:
        raise ConduitClientError(f"Could not reach Conduit API: {exc.reason}") from exc

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConduitClientError("Conduit response was not valid UTF-8 JSON") from exc
    if not isinstance(payload, dict):
        raise ConduitClientError("Conduit response root must be a JSON object")
    if payload.get("status") not in (None, "success"):
        raise ConduitClientError(f"Conduit payload status is not success: {payload.get('status')!r}")
    return ConduitPayload(payload=payload, source=f"conduit:{fromdate}:{todate}")
