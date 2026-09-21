"""API smoke/contract tests for the FastAPI layer (PROJECT_PLAN step 4)."""
from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.pipeline import run_evaluation
from tests.conftest import insert_obs

UTC = __import__("datetime").timezone.utc
END = __import__("datetime").datetime(2026, 9, 15, 12, 0, 0, tzinfo=UTC)


def fmt(dt) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def seed_quiet_week(conn) -> None:
    """7 days of hourly observations: bone dry but mild (triggers dry rules)."""
    for h in range(24 * 7):
        insert_obs(conn, fmt(END - timedelta(hours=h)), rg1=0.0, rg2=0.0,
                   temp_sht=20.0, humidity_sht=60.0, wind_spd=1.0,
                   wind_gust=3.0, press_bmx=852.0)


@pytest.fixture()
def client(conn):
    app = api_module.create_app()

    def _override():
        yield conn  # shared in-memory conn; never closed here

    app.dependency_overrides[api_module.get_db] = _override
    with TestClient(app) as c:
        yield c


def test_data_transparency(client, thresholds):
    resp = client.get("/api/data-transparency")
    assert resp.status_code == 200
    body = resp.json()
    assert body["risk_rules"]["version"] == thresholds["version"]
    assert any(r["id"] == "dry_72h" for r in body["risk_rules"]["rules"])
    assert body["fields_used"] and body["known_limitations"]
    assert "humidity_sht" in body["validation"]["ranges"]


def test_current_risk_auto_computes_and_persists(client, conn, thresholds):
    seed_quiet_week(conn)
    resp = client.get("/api/current-risk")
    assert resp.status_code == 200
    body = resp.json()
    # Continuous score: dry conditions dominate; mild temperature/humidity keep it Medium.
    assert body["risk_score"] == 56.9
    assert body["risk_level"] == "Medium"
    assert any(t["id"] == "dry_72h" for t in body["triggers"])
    assert set(body["recommendations"]) == {"residents", "farmers", "managers"}

    # the request path must have persisted the evaluation
    count = conn.execute("SELECT COUNT(*) FROM risk_evaluations").fetchone()[0]
    assert count == 1

    # second call serves the persisted row (same payload keys)
    resp2 = client.get("/api/current-risk")
    assert resp2.status_code == 200
    assert resp2.json()["risk_score"] == 56.9


def test_trends_environment_metrics(client, conn):
    seed_quiet_week(conn)
    resp = client.get("/api/trends", params={
        "metric": "temperature", "period": "24h", "at": fmt(END)})
    assert resp.status_code == 200
    body = resp.json()
    assert body["bucket"] == "hour"
    # [END-24h, END] inclusive -> 25 distinct hour buckets
    assert len(body["points"]) == 25
    assert all(p["value"] == 20.0 for p in body["points"])

    # 24 extra rain rows on 2026-09-14 (:30 offsets, no collision with hourly rows)
    for h in range(24):
        insert_obs(conn, f"2026-09-14T{h:02d}:30:00Z", rg1=0.1)
    rain = client.get("/api/trends", params={
        "metric": "rainfall", "period": "7d", "at": fmt(END)}).json()
    assert rain["bucket"] == "day"
    by_day = {p["t"]: p["value"] for p in rain["points"]}
    assert abs(by_day["2026-09-14"] - 2.4) < 0.01      # 0.1mm x 24 rows
    assert all(v == 0.0 for t, v in by_day.items() if t != "2026-09-14")

    gust = client.get("/api/trends", params={
        "metric": "wind_gust", "period": "24h", "at": fmt(END)}).json()
    assert all(p["value"] == 3.0 for p in gust["points"])


def test_trends_risk_score(client, conn, thresholds):
    seed_quiet_week(conn)
    run_evaluation(conn, now_utc=END, thresholds=thresholds)
    body = client.get("/api/trends", params={
        "metric": "risk_score", "period": "7d", "at": fmt(END)}).json()
    assert len(body["points"]) == 1
    assert body["points"][0]["value"] == 56.9


def test_trends_validates_params(client):
    assert client.get("/api/trends", params={"metric": "nope"}).status_code == 400
    assert client.get("/api/trends", params={
        "metric": "temperature", "period": "30h"}).status_code == 400
    assert client.get("/api/trends", params={
        "metric": "temperature", "at": "not-a-date"}).status_code == 400


def test_risk_distribution_backfills_one_result_per_day(client, conn):
    seed_quiet_week(conn)
    response = client.get("/api/risk-distribution", params={
        "period": "week", "at": fmt(END),
    })
    assert response.status_code == 200
    body = response.json()
    assert body["period"] == "week"
    assert body["total_days"] == len(body["daily"])
    assert body["total_days"] == 7
    assert len({point["date"] for point in body["daily"]}) == body["total_days"]
    assert sum(level["count"] for level in body["levels"]) == body["total_days"]
    assert abs(sum(level["probability"] for level in body["levels"]) - 100.0) <= 0.1


def test_alerts_history(client, conn, thresholds):
    seed_quiet_week(conn)
    assert client.get("/api/alerts").json()["count"] == 0  # empty history first

    run_evaluation(conn, now_utc=END, thresholds=thresholds)
    body = client.get("/api/alerts", params={"limit": 10}).json()
    assert body["count"] == 1
    alert = body["alerts"][0]
    assert alert["risk_level"] == "Medium"
    assert isinstance(alert["triggers"], list)
    assert alert["features"]["rainfall_72h_mm"] is not None
    assert alert["quality"]["coverage_24h"] is not None


def test_refresh_recomputes(client, conn, tmp_path):
    seed_quiet_week(conn)
    body = client.post("/api/refresh").json()
    assert body["ingest"] is None
    assert body["evaluation"]["risk_level"] == "Medium"

    # refresh with a source file re-ingests it first
    csv_file = tmp_path / "extra.csv"
    header = ("Time,Health,Battery Voltage,Battery charge status,Cell signal strength,"
              "Rain Gauge 1,Rain Gauge 2,Rain Gauge 1 Total Today,Rain Gauge 2 Total Today,"
              "Rain Gauge 1 Total Prior,Rain Gauge 2 Total Prior,"
              "BMX Temperature 1,BMX Pressure 1,MCP Temperature 1,SHT Temperature,SHT Humidity,"
              "SI1145 Visible 1,SI1145 Infrared 1,SI1145 Ultraviolet 1,"
              "Wind Speed,Wind Direction,Wind Gust,Wind Gust Direction,"
              "Heat Index,Wet Bulb Temperature,Wet Bulb Globe Temperature")
    csv_file.write_text(
        "# dataset: GeoCSV 2.0\n" + header + "\n"
        "2026-09-20T00:00:00Z,0,,3,100,0,0,0,0,0,0,12.2,852.1,12.5,12.6,86.7,"
        "261,253,0,0,159,0,0,12.4,11.2,8.1\n",
        encoding="utf-8",
    )
    body = client.post("/api/refresh", params={"source": str(csv_file)}).json()
    assert body["ingest"]["rows_inserted"] == 1
    total = conn.execute("SELECT COUNT(*) FROM weather_observations").fetchone()[0]
    assert total == 24 * 7 + 1
