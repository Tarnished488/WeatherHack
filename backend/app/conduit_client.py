"""Authenticated Conduit POST client.

Credentials are intentionally read only from environment variables.  This
module is used by the backend refresh service; the browser never sees them.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


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

    Expected environment variables:
    MAJIGUARD_CONDUIT_ENDPOINT, MAJIGUARD_CONDUIT_API_KEY,
    MAJIGUARD_CONDUIT_EMAIL.
    """
    if fromdate > todate:
        raise ConduitClientError("fromdate cannot be later than todate")
    if timeout_seconds <= 0:
        raise ConduitClientError("timeout_seconds must be greater than zero")

    endpoint = _required_env("MAJIGUARD_CONDUIT_ENDPOINT")
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
