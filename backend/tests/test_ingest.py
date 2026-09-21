"""GeoCSV ingestion tests: mapping, validation flags, dedup, fetch_runs."""
from __future__ import annotations

import json

from app.ingest import ingest_csv

HEADER = (
    "Time,Health,Battery Voltage,Battery charge status,Cell signal strength,"
    "Rain Gauge 1,Rain Gauge 2,Rain Gauge 1 Total Today,Rain Gauge 2 Total Today,"
    "Rain Gauge 1 Total Prior,Rain Gauge 2 Total Prior,"
    "BMX Temperature 1,BMX Pressure 1,MCP Temperature 1,SHT Temperature,SHT Humidity,"
    "SI1145 Visible 1,SI1145 Infrared 1,SI1145 Ultraviolet 1,"
    "Wind Speed,Wind Direction,Wind Gust,Wind Gust Direction,"
    "Heat Index,Wet Bulb Temperature,Wet Bulb Globe Temperature"
)

SAMPLE_CSV = """# dataset: GeoCSV 2.0
# field_unit: ISO_8601, %, #, %, mm, mm, degC
""" + HEADER + """
2026-09-01T00:00:00Z,0,,3,100,0,0,0,0,0,0,12.2,852.1,12.5,12.6,86.7,261,253,0,0,159,0,0,12.4,11.2,8.1
2026-09-01T00:01:00Z,0,,3,100,0,0,0,0,0,0,12.2,852.1,12.5,12.6,150.0,261,253,0,0,159,0,0,12.4,11.2,8.1
2026-09-01T00:02:00Z,0,,3,100,0,0,0,0,0,0,12.2,852.1,12.5,12.6,,261,253,0,0,159,0,0,12.4,11.2,8.1
2026-09-01T00:03:00Z,0,,3,100,0,0,0,0,0,0,12.2,852.1,12.5,12.6,86.7,261,253,0,0,159,0,0,12.4,11.2,8.1
"""


def test_ingest_flags_and_dedup(conn, tmp_path):
    csv_file = tmp_path / "sample.csv"
    csv_file.write_text(SAMPLE_CSV, encoding="utf-8")

    summary = ingest_csv(conn, csv_file, ingested_at_utc="2026-09-02T00:00:00Z")
    assert summary["rows_read"] == 4
    assert summary["rows_inserted"] == 4
    assert summary["rows_flagged"] == 2

    rows = conn.execute(
        "SELECT observed_at_utc, humidity_sht, is_valid, quality_flags_json "
        "FROM weather_observations ORDER BY observed_at_utc"
    ).fetchall()

    assert rows[0]["is_valid"] == 1
    assert json.loads(rows[0]["quality_flags_json"]) == []
    # humidity 150% -> out of range, flagged invalid
    assert rows[1]["humidity_sht"] == 150.0
    assert rows[1]["is_valid"] == 0
    assert any("out of range" in f for f in json.loads(rows[1]["quality_flags_json"]))
    # missing humidity -> stored as NULL, flagged invalid
    assert rows[2]["humidity_sht"] is None
    assert rows[2]["is_valid"] == 0
    assert any("missing" in f for f in json.loads(rows[2]["quality_flags_json"]))

    # re-ingesting the same file must not duplicate rows
    summary2 = ingest_csv(conn, csv_file, ingested_at_utc="2026-09-02T01:00:00Z")
    assert summary2["rows_inserted"] == 0
    total = conn.execute("SELECT COUNT(*) FROM weather_observations").fetchone()[0]
    assert total == 4

    runs = conn.execute(
        "SELECT id, rows_read, rows_inserted, status FROM fetch_runs WHERE source != 'test-source'"
    ).fetchall()
    assert len(runs) == 2
    assert runs[0]["rows_read"] == 4 and runs[0]["status"] == "ok"
