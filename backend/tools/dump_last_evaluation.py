"""One-off verification: dump the persisted risk_evaluations row to a UTF-8 file."""
from __future__ import annotations

import json
import sqlite3
import sys

sys.path.insert(0, r"D:\Users\yqy08\VScodeProjects\WheatherHack\WheaterHack\backend")
from app.db import DEFAULT_DB_PATH, ensure_schema  # noqa: E402

conn = sqlite3.connect(str(DEFAULT_DB_PATH))
conn.row_factory = sqlite3.Row
ensure_schema(conn)

rows = conn.execute(
    "SELECT * FROM risk_evaluations ORDER BY evaluated_at_utc DESC LIMIT 1"
).fetchall()

out = []
for r in rows:
    out.append(
        {
            "id": r["id"],
            "window_end_utc": r["window_end_utc"],
            "evaluated_at_utc": r["evaluated_at_utc"],
            "rules_version": r["rules_version"],
            "risk_score": r["risk_score"],
            "risk_level": r["risk_level"],
            "confidence": r["confidence"],
            "triggers": json.loads(r["triggers_json"]),
            "recommendations": json.loads(r["recommendations_json"]),
            "features": json.loads(r["features_json"]),
        }
    )

counts = conn.execute(
    "SELECT (SELECT COUNT(*) FROM weather_observations) AS obs, "
    "(SELECT COUNT(*) FROM fetch_runs) AS runs, "
    "(SELECT COUNT(*) FROM risk_evaluations) AS evals"
).fetchone()

result = {"table_counts": dict(counts), "latest_evaluation": out[0] if out else None}
target = r"D:\Users\yqy08\VScodeProjects\WheatherHack\WheaterHack\backend\data\last_evaluation.json"
with open(target, "w", encoding="utf-8") as fh:
    json.dump(result, fh, ensure_ascii=False, indent=2)
print("written:", target)
