"""Thresholds config loading & validation (step 3 of the workflow)."""
from __future__ import annotations

import json
from pathlib import Path

DEFAULT_THRESHOLD_PATH = Path(__file__).resolve().parents[1] / "config" / "risk_thresholds.json"

SUPPORTED_SCOPES = {"stress", "burst"}
SUPPORTED_OPS = {"<=", ">=", "<", ">", "==", "between"}


class ConfigError(ValueError):
    """Raised when risk_thresholds.json is missing or malformed."""


def load_thresholds(path: str | Path | None = None) -> dict:
    """Load and structurally validate the versioned thresholds config."""
    cfg_path = Path(path) if path else DEFAULT_THRESHOLD_PATH
    if not cfg_path.exists():
        raise ConfigError(f"Thresholds config not found: {cfg_path}")
    with cfg_path.open(encoding="utf-8") as fh:
        cfg = json.load(fh)

    for key in ("version", "risk_levels", "rules", "confidence", "features", "level_recommendations"):
        if key not in cfg:
            raise ConfigError(f"Thresholds config missing required key: {key!r}")
    for key in ("low_max", "medium_max"):
        if key not in cfg["risk_levels"]:
            raise ConfigError(f"risk_levels missing required key: {key!r}")

    seen_ids: set[str] = set()
    for rule in cfg["rules"]:
        for key in ("id", "scope", "weight", "conditions", "description"):
            if key not in rule:
                raise ConfigError(f"Rule missing required key {key!r}: {rule}")
        if rule["id"] in seen_ids:
            raise ConfigError(f"Duplicate rule id: {rule['id']!r}")
        seen_ids.add(rule["id"])
        if rule["scope"] not in SUPPORTED_SCOPES:
            raise ConfigError(f"Rule {rule['id']!r} has unsupported scope {rule['scope']!r}")
        if not rule["conditions"]:
            raise ConfigError(f"Rule {rule['id']!r} has no conditions")
        for cond in rule["conditions"]:
            if cond.get("op") not in SUPPORTED_OPS:
                raise ConfigError(
                    f"Rule {rule['id']!r} uses unsupported operator {cond.get('op')!r}"
                )
            for key in ("feature", "value"):
                if key not in cond:
                    raise ConfigError(f"Rule {rule['id']!r} condition missing {key!r}")

    for level in ("Low", "Medium", "High"):
        if level not in cfg["level_recommendations"]:
            raise ConfigError(f"level_recommendations missing {level!r}")

    return cfg
