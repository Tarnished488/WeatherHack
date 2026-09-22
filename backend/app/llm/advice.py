"""Strict parsing/validation of LLM advice responses.

The model must answer with exactly one object:

    {"residents": {"summary": str, "actions": [str, ...]},
     "farmers":   {...},
     "managers":  {...}}

Anything else (missing role, empty summary, missing/empty action list,
non-JSON) raises LLMAdvisorError and the service layer falls back to the
fixed rule-engine templates.  Being strict here is deliberate: a public
advisory product must never forward half-structured model output.
"""
from __future__ import annotations

import json

from ..engine import ROLES


class LLMAdvisorError(ValueError):
    """Raised when the LLM response cannot be parsed into valid advice."""


def extract_json_object(content: str) -> str:
    """Pull the first JSON object out of a model reply.

    Providers without a strict JSON mode (and chatty models in general) may
    wrap the payload in markdown fences or add prose.  We deliberately do
    not send ``response_format: json_object`` to every provider because the
    flag is not portable across the registry; this tolerant extraction is
    the portable equivalent.
    """
    text = (content or "").strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1 :]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
        text = text.strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return text[start : end + 1]
    return text


def parse_advice(content: str) -> dict:
    """Validate the model output: one summary + short action list per role."""
    try:
        data = json.loads(extract_json_object(content))
    except (TypeError, ValueError) as exc:
        raise LLMAdvisorError(f"advice is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise LLMAdvisorError("advice must be a JSON object")
    advice: dict[str, dict] = {}
    for role in ROLES:
        entry = data.get(role)
        if not isinstance(entry, dict):
            raise LLMAdvisorError(f"missing advice object for role {role!r}")
        summary = str(entry.get("summary") or "").strip()
        raw_actions = entry.get("actions")
        if not summary:
            raise LLMAdvisorError(f"role {role!r} needs a non-empty summary")
        if not isinstance(raw_actions, list):
            raise LLMAdvisorError(f"role {role!r} needs an 'actions' list")
        actions = [str(a).strip() for a in raw_actions if str(a).strip()][:4]
        if not actions:
            raise LLMAdvisorError(f"role {role!r} needs at least one action")
        advice[role] = {"summary": summary, "actions": actions}
    return advice
