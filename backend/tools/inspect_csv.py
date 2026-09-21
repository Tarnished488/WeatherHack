"""Inspect raw Conduit GeoCSV files to understand data distributions.

Used to tune risk thresholds against real data (PROJECT_PLAN step 3.4).

Usage:
    python tools/inspect_csv.py path/to/file.csv [more.csv ...]
"""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

COLUMNS = [
    "time", "health", "battery_voltage", "battery_status", "cell_signal",
    "rg1", "rg2", "rg1tt", "rg2tt", "rg1tp", "rg2tp",
    "temp_bmx", "press_bmx", "temp_mcp", "temp_sht", "humidity_sht",
    "si1145_vis", "si1145_ir", "si1145_uv",
    "wind_spd", "wind_dir", "wind_gust", "wind_gust_dir",
    "heat_idx", "wet_bulb_temp", "wet_bulb_globe_temp",
]


def parse_float(value: str) -> float | None:
    if value is None or value.strip() == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def load_rows(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(newline="", encoding="utf-8-sig") as fh:
        lines = (ln for ln in fh if not ln.lstrip().startswith("#"))
        reader = csv.DictReader(lines)
        reader.fieldnames = COLUMNS
        for raw in reader:
            if not raw.get("time") or raw["time"].strip().lower() == "time":
                continue  # skip header row
            rows.append(raw)
    return rows


def main() -> None:
    for arg in sys.argv[1:]:
        path = Path(arg)
        rows = load_rows(path)
        times = [datetime.fromisoformat(r["time"].replace("Z", "+00:00")) for r in rows]
        print(f"\n=== {path.name} ===")
        print(f"rows={len(rows)}  span={min(times):%Y-%m-%d %H:%M} .. {max(times):%Y-%m-%d %H:%M} UTC")

        for key in ["rg1", "rg2", "rg1tt", "rg2tt", "temp_sht", "humidity_sht",
                    "wind_spd", "wind_gust", "heat_idx", "press_bmx"]:
            vals = [parse_float(r[key]) for r in rows]
            vals = [v for v in vals if v is not None]
            if vals:
                print(f"{key:12s} min={min(vals):8.2f} max={max(vals):8.2f} "
                      f"mean={sum(vals)/len(vals):8.2f} nonnull={len(vals)}/{len(rows)}")
            else:
                print(f"{key:12s} all empty")

        # per-day rainfall to understand gauge semantics
        per_day_rg1: dict[str, float] = defaultdict(float)
        per_day_tt_max: dict[str, float] = defaultdict(float)
        for r in rows:
            day = r["time"][:10]
            v = parse_float(r["rg1"])
            if v:
                per_day_rg1[day] += v
            v2 = parse_float(r["rg1tt"])
            if v2 is not None and v2 > per_day_tt_max[day]:
                per_day_tt_max[day] = v2
        print("per-day: sum(rg1) | max(rg1tt)")
        for day in sorted(per_day_tt_max):
            print(f"  {day}: {per_day_rg1[day]:7.1f} | {per_day_tt_max[day]:7.1f}")


if __name__ == "__main__":
    main()
