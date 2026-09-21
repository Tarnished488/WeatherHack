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


def parse_advice(content: str) -> dict:
    """Validate the model output: one summary + short action list per role."""
    try:
        data = json.loads(content)
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
