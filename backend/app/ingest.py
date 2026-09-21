"""Official Conduit GeoCSV -> weather_observations ingestion.

The ingestion **flags** suspicious data instead of deleting it (plan section
"对可疑数据打标而不是静默删除"): out-of-range or missing key readings set
is_valid = 0 and append a human-readable entry to quality_flags_json.

CLI:
    python -m app.ingest --source ../RainData
    python -m app.ingest --source path/to/file.csv --db data/majiguard.db
"""
from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from .db import DEFAULT_DB_PATH, connect, ensure_schema
from .features import fmt_utc, parse_utc

# GeoCSV comment header lines start with '#'; the first non-comment line is
# the English column header (Time, Health, ...).
COLUMN_MAP = {
    "time": "observed_at_utc",
    "rain gauge 1": "rg1",
    "rain gauge 2": "rg2",
    "rain gauge 1 total today": "rg1tt",
    "rain gauge 2 total today": "rg2tt",
    "rain gauge 1 total prior": "rg1tp",
    "rain gauge 2 total prior": "rg2tp",
    "bmx temperature 1": "temp_bmx",
    "bmx pressure 1": "press_bmx",
    "mcp temperature 1": "temp_mcp",
    "sht temperature": "temp_sht",
    "sht humidity": "humidity_sht",
    "si1145 visible 1": "si1145_vis",
    "si1145 infrared 1": "si1145_ir",
    "si1145 ultraviolet 1": "si1145_uv",
    "wind speed": "wind_spd",
    "wind direction": "wind_dir",
    "wind gust": "wind_gust",
    "wind gust direction": "wind_gust_dir",
    "heat index": "heat_idx",
    "wet bulb temperature": "wet_bulb_temp",
    "wet bulb globe temperature": "wet_bulb_globe_temp",
}

# (min, max) physical plausibility ranges per DB field.
VALIDATION_RANGES = {
    "rg1": (0.0, 1000.0),
    "rg2": (0.0, 1000.0),
    "rg1tt": (0.0, 1000.0),
    "rg2tt": (0.0, 1000.0),
    "rg1tp": (0.0, 1000.0),
    "rg2tp": (0.0, 1000.0),
    "temp_bmx": (-20.0, 60.0),
    "temp_mcp": (-20.0, 60.0),
    "temp_sht": (-20.0, 60.0),
    "heat_idx": (-20.0, 60.0),
    "wet_bulb_temp": (-20.0, 60.0),
    "wet_bulb_globe_temp": (-20.0, 60.0),
    "press_bmx": (300.0, 1100.0),
    "humidity_sht": (0.0, 100.0),
    "si1145_vis": (0.0, 100_000.0),
    "si1145_ir": (0.0, 100_000.0),
    "si1145_uv": (0.0, 30.0),
    "wind_spd": (0.0, 75.0),
    "wind_dir": (0.0, 360.0),
    "wind_gust": (0.0, 75.0),
    "wind_gust_dir": (0.0, 360.0),
}

# Missing readings in these fields make the row invalid for risk analysis.
KEY_FIELDS = ("rg1", "rg2", "temp_sht", "humidity_sht", "wind_spd")

INSERT_SQL = """
INSERT INTO weather_observations (
    observed_at_utc, fetch_run_id,
    rg1, rg2, rg1tt, rg2tt, rg1tp, rg2tp,
    temp_bmx, press_bmx, temp_mcp, temp_sht, humidity_sht,
    si1145_vis, si1145_ir, si1145_uv,
    wind_spd, wind_dir, wind_gust, wind_gust_dir,
    heat_idx, wet_bulb_temp, wet_bulb_globe_temp,
    is_valid, quality_flags_json, ingested_at_utc
) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
)
ON CONFLICT(observed_at_utc) DO NOTHING
"""

FIELD_ORDER = [
    "rg1", "rg2", "rg1tt", "rg2tt", "rg1tp", "rg2tp",
    "temp_bmx", "press_bmx", "temp_mcp", "temp_sht", "humidity_sht",
    "si1145_vis", "si1145_ir", "si1145_uv",
    "wind_spd", "wind_dir", "wind_gust", "wind_gust_dir",
    "heat_idx", "wet_bulb_temp", "wet_bulb_globe_temp",
]


def _parse_number(raw: str | None) -> float | None:
    if raw is None or raw.strip() == "":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def validate_row(values: dict) -> tuple[int, list[str]]:
    """Return (is_valid, quality_flags). Flags explain every anomaly."""
    flags: list[str] = []
    for field, (lo, hi) in VALIDATION_RANGES.items():
        value = values.get(field)
        if value is None:
            continue  # missing values handled below
        if not lo <= value <= hi:
            flags.append(f"{field}={value} out of range ({lo}-{hi})")
    for field in KEY_FIELDS:
        if values.get(field) is None:
            flags.append(f"{field} missing")
    return (0 if flags else 1), flags


def iter_geocsv_rows(path: Path):
    """Yield (observed_dt, values_dict, is_valid, flags) per data row."""
    with path.open(newline="", encoding="utf-8-sig") as fh:
        lines = (ln for ln in fh if not ln.lstrip().startswith("#"))
        reader = csv.reader(lines)
        header: list[str] | None = None
        for cells in reader:
            if not cells or all(c.strip() == "" for c in cells):
                continue
            if header is None:
                header = [c.strip().lower() for c in cells]
                continue
            if cells[0].strip().lower() == "time":
                continue  # repeated header inside the file
            mapped: dict[str, float | None] = {}
            ts_raw = ""
            for name, raw in zip(header, cells):
                db_field = COLUMN_MAP.get(name)
                if db_field == "observed_at_utc":
                    ts_raw = raw.strip()
                elif db_field:
                    mapped[db_field] = _parse_number(raw)
            try:
                observed_dt = parse_utc(ts_raw)
            except (ValueError, TypeError):
                continue  # unparseable timestamp row is skipped and counted
            is_valid, flags = validate_row(mapped)
            yield observed_dt, mapped, is_valid, flags


def ingest_csv(conn, source: str | Path, ingested_at_utc: str | None = None) -> dict:
    """Ingest one CSV file (or a directory of *.csv) into the database."""
    ensure_schema(conn)
    source_path = Path(source)
    files = sorted(source_path.glob("*.csv")) if source_path.is_dir() else [source_path]
    if not files:
        raise FileNotFoundError(f"No CSV file found at {source_path}")

    ingested_at = ingested_at_utc or fmt_utc(datetime.now(timezone.utc))
    started_at = ingested_at
    summary = {"source": str(source_path), "files": [f.name for f in files],
               "rows_read": 0, "rows_inserted": 0, "rows_flagged": 0, "rows_skipped": 0}

    for path in files:
        cur = conn.execute(
            "INSERT INTO fetch_runs (source, started_at_utc, status) VALUES (?, ?, 'running')",
            (str(path), started_at),
        )
        run_id = cur.lastrowid
        rows_read = rows_inserted = rows_flagged = rows_skipped = 0

        for observed_dt, values, is_valid, flags in iter_geocsv_rows(path):
            rows_read += 1
            if observed_dt is None:
                rows_skipped += 1
                continue
            if not is_valid:
                rows_flagged += 1
            params = [fmt_utc(observed_dt), run_id]
            params += [values.get(f) for f in FIELD_ORDER]
            params += [is_valid, json.dumps(flags, ensure_ascii=False), ingested_at]
            cur = conn.execute(INSERT_SQL, params)
            rows_inserted += max(cur.rowcount, 0)

        conn.execute(
            """
            UPDATE fetch_runs
            SET finished_at_utc = ?, rows_read = ?, rows_inserted = ?,
                rows_flagged = ?, status = 'ok'
            WHERE id = ?
            """,
            (fmt_utc(datetime.now(timezone.utc)), rows_read, rows_inserted,
             rows_flagged, run_id),
        )
        summary["rows_read"] += rows_read
        summary["rows_inserted"] += rows_inserted
        summary["rows_flagged"] += rows_flagged
        summary["rows_skipped"] += rows_skipped

    conn.commit()
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest Conduit GeoCSV into SQLite")
    parser.add_argument("--source", required=True, help="CSV file or directory of CSVs")
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    args = parser.parse_args(argv)

    conn = connect(args.db)
    try:
        summary = ingest_csv(conn, args.source)
    finally:
        conn.close()
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
