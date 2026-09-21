"""Conduit JSON cleaning uses the same DB contract as CSV ingestion."""
from __future__ import annotations

import json

from app.conduit_ingest import ingest_conduit_payload


def test_ingest_conduit_payload_maps_validates_and_deduplicates(conn):
    payload = {"status": "success", "data": [
        {"ts": "2026-09-01T00:00:00Z", "rg1": "0", "rg2": "0", "temp_sht": "23.4",
         "humidity_sht": "48", "wind_spd": "2.1", "wind_gust": "4.2"},
        {"ts": "2026-09-01T00:01:00Z", "rg1": "0", "rg2": "0", "temp_sht": "23.4",
         "humidity_sht": "101", "wind_spd": "2.1"},
        {"ts": "not-a-time", "rg1": "0"},
    ]}
    summary = ingest_conduit_payload(conn, payload, "conduit:2026-09-01:2026-09-01")

    assert summary == {
        "source": "conduit:2026-09-01:2026-09-01", "rows_read": 3,
        "rows_inserted": 2, "rows_flagged": 1, "rows_skipped": 1,
    }
    row = conn.execute(
        "SELECT is_valid, quality_flags_json FROM weather_observations "
        "WHERE observed_at_utc = '2026-09-01T00:01:00Z'"
    ).fetchone()
    assert row["is_valid"] == 0
    assert "humidity_sht=101.0 out of range" in json.loads(row["quality_flags_json"])[0]
