"""Conduit JSON response -> the shared ``weather_observations`` table."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from .features import fmt_utc, parse_utc
from .ingest import COLUMN_MAP, FIELD_ORDER, INSERT_SQL, _parse_number, validate_row


# API responses usually use DB-style keys; labels from the GeoCSV are accepted
# as aliases too, so both data formats share exactly the same validation rules.
TIME_KEYS = ("ts", "time", "timestamp", "observed_at_utc")


def _normalise_record(record: dict):
    values: dict[str, float | None] = {}
    timestamp = None
    for raw_key, raw_value in record.items():
        key = str(raw_key).strip().lower()
        if key in TIME_KEYS:
            timestamp = str(raw_value).strip() if raw_value is not None else None
            continue
        field = key if key in FIELD_ORDER else COLUMN_MAP.get(key)
        if field:
            values[field] = _parse_number(str(raw_value)) if raw_value is not None else None
    if not timestamp:
        return None
    try:
        observed_at = parse_utc(timestamp)
    except (TypeError, ValueError):
        return None
    is_valid, flags = validate_row(values)
    return observed_at, values, is_valid, flags


def ingest_conduit_payload(conn, payload: dict, source: str, ingested_at_utc: str | None = None) -> dict:
    """Validate and insert a successful Conduit JSON ``data`` array.

    Invalid timestamps are skipped.  Sensor anomalies are retained with
    ``is_valid=0`` and explanatory quality flags, like the CSV pipeline.
    """
    records = payload.get("data")
    if not isinstance(records, list):
        raise ValueError("Conduit payload must contain a list in 'data'")
    if not all(isinstance(record, dict) for record in records):
        raise ValueError("Every Conduit data item must be an object")

    ingested_at = ingested_at_utc or fmt_utc(datetime.now(timezone.utc))
    cur = conn.execute(
        "INSERT INTO fetch_runs (source, started_at_utc, status) VALUES (?, ?, 'running')",
        (source, ingested_at),
    )
    run_id = cur.lastrowid
    summary = {"source": source, "rows_read": len(records), "rows_inserted": 0,
               "rows_flagged": 0, "rows_skipped": 0}

    for record in records:
        normalised = _normalise_record(record)
        if normalised is None:
            summary["rows_skipped"] += 1
            continue
        observed_at, values, is_valid, flags = normalised
        if not is_valid:
            summary["rows_flagged"] += 1
        params = [fmt_utc(observed_at), run_id]
        params += [values.get(field) for field in FIELD_ORDER]
        params += [is_valid, json.dumps(flags, ensure_ascii=False), ingested_at]
        cur = conn.execute(INSERT_SQL, params)
        summary["rows_inserted"] += max(cur.rowcount, 0)

    conn.execute(
        """UPDATE fetch_runs SET finished_at_utc = ?, rows_read = ?, rows_inserted = ?,
           rows_flagged = ?, status = 'ok' WHERE id = ?""",
        (fmt_utc(datetime.now(timezone.utc)), summary["rows_read"], summary["rows_inserted"],
         summary["rows_flagged"], run_id),
    )
    conn.commit()
    return summary
