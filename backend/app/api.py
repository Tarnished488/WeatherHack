"""FastAPI REST API for the MajiGuard frontend (PROJECT_PLAN step 4).

Endpoints (plan section 7, step 4):
    GET  /api/current-risk       latest persisted evaluation (auto-computes once)
    GET  /api/trends             metric time series (rainfall/temperature/...)
    GET  /api/alerts             evaluation / alert history
    GET  /api/data-transparency  data source, fields, rules version, limitations
    POST /api/refresh            re-ingest + re-evaluate (CSV Demo or Conduit POST)

Run:
    python -m app.api            # docs at http://127.0.0.1:8000/docs

CORS: allow_origins defaults to "*" for the hackathon demo; restrict it via
the MAJIGUARD_CORS_ORIGINS env var (comma-separated) before real deployment.
    Database path can be overridden with MAJIGUARD_DB.  Live Conduit refresh
    additionally needs MAJIGUARD_CONDUIT_ENDPOINT, MAJIGUARD_CONDUIT_API_KEY,
    and MAJIGUARD_CONDUIT_EMAIL.
"""
from __future__ import annotations

import json
import os

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import load_thresholds
from .db import DEFAULT_DB_PATH, connect, ensure_schema
from .features import WINDOW_24H, WINDOW_72H, WINDOW_7D, fmt_utc, parse_utc, utc_now
from .ingest import VALIDATION_RANGES, ingest_csv
from .pipeline import run_evaluation
from .conduit_client import ConduitClientError
from .refresh_service import refresh_from_conduit

API_DB_PATH = os.environ.get("MAJIGUARD_DB", str(DEFAULT_DB_PATH))
CORS_ORIGINS = [
    o.strip() for o in os.environ.get("MAJIGUARD_CORS_ORIGINS", "*").split(",") if o.strip()
]

TREND_PERIODS = {"24h": WINDOW_24H, "72h": WINDOW_72H, "7d": WINDOW_7D}

# metric -> (sql expression builder kind, column, description)
TREND_METRICS = {
    "rainfall": ("rain", None, "Cumulative rainfall (mm), rg1+rg2"),
    "temperature": ("agg", "AVG(temp_sht)", "Mean air temperature (C)"),
    "humidity": ("agg", "AVG(humidity_sht)", "Mean relative humidity (%)"),
    "wind_speed": ("agg", "AVG(wind_spd)", "Mean wind speed (m/s)"),
    "wind_gust": ("agg", "MAX(wind_gust)", "Max wind gust (m/s)"),
    "pressure": ("agg", "AVG(press_bmx)", "Mean pressure (hPa)"),
}

FIELD_DOCS = [
    ("rg1", "mm", "Rain gauge 1 per-minute rainfall"),
    ("rg2", "mm", "Rain gauge 2 per-minute rainfall"),
    ("temp_sht", "degC", "Air temperature (SHT sensor)"),
    ("humidity_sht", "%", "Relative humidity (SHT sensor)"),
    ("wind_spd", "m/s", "Average wind speed"),
    ("wind_gust", "m/s", "Wind gust speed"),
    ("press_bmx", "hPa", "Atmospheric pressure (BMP sensor)"),
    ("heat_idx", "degC", "Heat index"),
    ("wet_bulb_temp", "degC", "Wet-bulb temperature"),
    ("wet_bulb_globe_temp", "degC", "Wet-bulb globe temperature"),
    ("si1145_vis / si1145_ir / si1145_uv", "#", "Visible / infrared / UV readings"),
]

KNOWN_LIMITATIONS = [
    "Thresholds are tuned on a single station (JKUAT, Kiambu) using ~3 weeks of data (Aug-Sep 2026); not yet validated across seasons.",
    "No medical, public-health, or drinking-water-safety conclusions.",
    "No precise irrigation volumes or crop-specific prescriptions.",
    "No authoritative flood forecasting; a rainfall burst is only a storage/drainage heads-up.",
    "No water-quality or water-quantity fields are assumed in the data.",
    "Decision support only; the system never controls pumps, irrigation equipment, or public infrastructure.",
]


def get_db():
    """One connection per request; schema ensured (idempotent)."""
    conn = connect(API_DB_PATH)
    try:
        ensure_schema(conn)
        yield conn
    finally:
        conn.close()


def _evaluation_payload(row) -> dict:
    """Shape a risk_evaluations row for the frontend."""
    blob = json.loads(row["features_json"])
    return {
        "window_end_utc": row["window_end_utc"],
        "evaluated_at_utc": row["evaluated_at_utc"],
        "rules_version": row["rules_version"],
        "risk_score": row["risk_score"],
        "risk_level": row["risk_level"],
        "confidence": row["confidence"],
        "triggers": json.loads(row["triggers_json"]),
        "recommendations": json.loads(row["recommendations_json"]),
        "features": blob.get("features"),
        "quality": blob.get("quality"),
    }


def _result_payload(result: dict) -> dict:
    """Shape an in-memory evaluation result (same keys as _evaluation_payload)."""
    return {
        "window_end_utc": result["window_end_utc"],
        "evaluated_at_utc": result["evaluated_at_utc"],
        "rules_version": result["rules_version"],
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "confidence": result["confidence"],
        "burst_alert": result["burst_alert"],
        "triggers": result["triggers"],
        "recommendations": result["recommendations"],
        "features": result["features"],
        "quality": result["quality"],
    }


def _latest_evaluation_row(conn):
    return conn.execute(
        "SELECT * FROM risk_evaluations "
        "ORDER BY window_end_utc DESC, evaluated_at_utc DESC LIMIT 1"
    ).fetchone()


def create_app() -> FastAPI:
    app = FastAPI(
        title="MajiGuard API",
        description="Community water-stress risk and action guidance (Hack The Weather)",
        version="1.0.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/")
    def root():
        return {"service": "MajiGuard API", "docs": "/docs",
                "endpoints": ["/api/current-risk", "/api/trends", "/api/alerts",
                              "/api/data-transparency", "/api/refresh"]}

    # ------------------------------------------------------------------
    @app.get("/api/current-risk")
    def current_risk(conn=Depends(get_db)):
        """Current risk: serves the latest persisted evaluation; computes and stores one on first call."""
        row = _latest_evaluation_row(conn)
        if row is None:
            result = run_evaluation(conn)
            return _result_payload(result)
        return _evaluation_payload(row)

    # ------------------------------------------------------------------
    @app.get("/api/trends")
    def trends(
        metric: str = Query(..., description="rainfall|temperature|humidity|wind_speed|wind_gust|pressure|risk_score"),
        period: str = Query("24h", description="24h|72h|7d"),
        at: str | None = Query(None, description="Look back as of this UTC time (ISO 8601); defaults to now"),
        conn=Depends(get_db),
    ):
        """Time series for key metrics: hourly buckets for 24h/72h, daily for 7d."""
        if period not in TREND_PERIODS:
            raise HTTPException(status_code=400,
                                detail=f"period must be one of {sorted(TREND_PERIODS)}")
        if metric != "risk_score" and metric not in TREND_METRICS:
            raise HTTPException(
                status_code=400,
                detail=f"metric must be one of {sorted(set(TREND_METRICS) | {'risk_score'})}",
            )
        try:
            at_dt = parse_utc(at) if at else utc_now()
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"Cannot parse at: {at!r}")

        since = fmt_utc(at_dt - TREND_PERIODS[period])
        until = fmt_utc(at_dt)
        bucket_len = 10 if period == "7d" else 13  # 'YYYY-MM-DD' vs 'YYYY-MM-DDTHH'

        if metric == "risk_score":
            sql = (
                f"SELECT substr(window_end_utc, 1, {bucket_len}) AS b, AVG(risk_score) AS v "
                "FROM risk_evaluations WHERE window_end_utc >= ? AND window_end_utc <= ? "
                "GROUP BY b ORDER BY b"
            )
            rows = conn.execute(sql, (since, until)).fetchall()
        else:
            kind, expr, _ = TREND_METRICS[metric]
            if kind == "rain":
                select = "SUM(COALESCE(rg1, 0) + COALESCE(rg2, 0))"
                where = "is_valid = 1"
            else:
                select = expr
                col = expr.split("(")[1].rstrip(")")
                where = f"is_valid = 1 AND {col} IS NOT NULL"
            sql = (
                f"SELECT substr(observed_at_utc, 1, {bucket_len}) AS b, {select} AS v "
                f"FROM weather_observations WHERE observed_at_utc >= ? AND observed_at_utc <= ? "
                f"AND {where} GROUP BY b ORDER BY b"
            )
            rows = conn.execute(sql, (since, until)).fetchall()

        return {
            "metric": metric,
            "period": period,
            "bucket": "day" if period == "7d" else "hour",
            "points": [
                {"t": r["b"], "value": round(r["v"], 3) if r["v"] is not None else None}
                for r in rows
            ],
        }

    # ------------------------------------------------------------------
    @app.get("/api/alerts")
    def alerts(
        limit: int = Query(50, ge=1, le=200),
        conn=Depends(get_db),
    ):
        """Alert / evaluation history: every entry carries its triggered rules, evidence features and recommendations (fully traceable)."""
        rows = conn.execute(
            "SELECT * FROM risk_evaluations "
            "ORDER BY window_end_utc DESC, evaluated_at_utc DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return {"count": len(rows), "alerts": [_evaluation_payload(r) for r in rows]}

    # ------------------------------------------------------------------
    @app.get("/api/data-transparency")
    def data_transparency(conn=Depends(get_db)):
        """Data transparency page: data source, fields, cleaning policy, rules version and known limitations."""
        cfg = load_thresholds()
        return {
            "data_source": {
                "name": "Conduit@Empathy1 weather station (3D FEWS NET / UCAR ICDP)",
                "site": "Kenya Kiambu, Site JKUAT IOT AWS",
                "doi": "https://doi.org/10.5065/d6v1236q",
                "sampling_interval": "1 minute",
                "aggregation": "Trends aggregate hourly (24h/72h) or daily (7d)",
            },
            "fields_used": [
                {"column": col, "unit": unit, "description": desc}
                for col, unit, desc in FIELD_DOCS
            ],
            "validation": {
                "policy": "Out-of-range or missing key readings set is_valid=0 and are recorded in quality_flags_json; data is flagged, never deleted",
                "ranges": VALIDATION_RANGES,
            },
            "risk_rules": {
                "version": cfg["version"],
                "rules": [
                    {
                        "id": r["id"],
                        "scope": r["scope"],
                        "weight": r["weight"],
                        "conditions": r["conditions"],
                        "description": r["description"],
                    }
                    for r in cfg["rules"]
                ],
            },
            "known_limitations": KNOWN_LIMITATIONS,
        }

    # ------------------------------------------------------------------
    @app.post("/api/refresh")
    def refresh(source: str | None = Query(None, description="Optional: CSV file or directory to re-ingest"),
                conn=Depends(get_db)):
        """Dev / demo only: optionally re-ingest CSVs, then re-evaluate and persist."""
    def refresh(
        source: str | None = Query(None, description="Demo：本地 CSV/目录路径"),
        fromdate: str | None = Query(None, description="Conduit 起始日期，例如 2026-09-01"),
        todate: str | None = Query(None, description="Conduit 结束日期，例如 2026-09-02"),
        conn=Depends(get_db),
    ):
        """刷新风险：本地 CSV Demo 或受保护的 Conduit POST 拉取。"""
        if source and (fromdate or todate):
            raise HTTPException(status_code=400, detail="source 不能与 fromdate/todate 同时使用")
        if bool(fromdate) != bool(todate):
            raise HTTPException(status_code=400, detail="fromdate 和 todate 必须同时提供")
        if fromdate and todate:
            try:
                return refresh_from_conduit(conn, fromdate, todate)
            except (ConduitClientError, ValueError) as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
        ingest_summary = None
        if source:
            ingest_summary = ingest_csv(conn, source)
        result = run_evaluation(conn)
        return {
            "ingest": ingest_summary,
            "evaluation": _result_payload(result),
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
