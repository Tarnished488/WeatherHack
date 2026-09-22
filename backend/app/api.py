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
from datetime import timedelta

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import load_thresholds
from .db import DEFAULT_DB_PATH, connect, ensure_schema
from .features import WINDOW_24H, WINDOW_72H, WINDOW_7D, fmt_utc, latest_observation_time, parse_utc, utc_now
from .ingest import VALIDATION_RANGES, ingest_csv
from .pipeline import run_daily_evaluations, run_evaluation
from .conduit_client import ConduitClientError
from .refresh_service import refresh_from_conduit
from .llm import public_provider_list
from .llm import service as llm_service

API_DB_PATH = os.environ.get("MAJIGUARD_DB", str(DEFAULT_DB_PATH))


class LlmAdviceRequest(BaseModel):
    """Bring-your-own-key flexible-advice request.

    ``api_key`` is the visitor's own provider key.  FastAPI never logs the
    body, the service never persists it, and it is excluded from every
    response payload.
    """

    provider: str
    api_key: str
    model: str | None = None

CORS_ORIGINS = [
    o.strip() for o in os.environ.get("MAJIGUARD_CORS_ORIGINS", "*").split(",") if o.strip()
]

TREND_PERIODS = {
    # Current dashboard ranges.
    "day": WINDOW_24H,
    "week": WINDOW_7D,
    "month": timedelta(days=30),
    "three_months": timedelta(days=90),
    # Kept for existing API consumers and tests.
    "24h": WINDOW_24H,
    "72h": WINDOW_72H,
    "7d": WINDOW_7D,
}
TREND_BUCKETS = {
    "day": "hour", "week": "day", "month": "day", "three_months": "day",
    "24h": "hour", "72h": "hour", "7d": "day",
}
REFRESH_WINDOWS = {"day", "week", "month", "three_months"}
CALENDAR_DAY_COUNTS = {"day": 1, "week": 7, "month": 30, "three_months": 90}

# metric -> (sql expression builder kind, column, description)
TREND_METRICS = {
    "rainfall": ("rain", None, "Cumulative rainfall (mm), rg1+rg2"),
    "temperature": ("agg", "AVG(temp_sht)", "Mean air temperature (C)"),
    "humidity": ("agg", "AVG(humidity_sht)", "Mean relative humidity (%)"),
    "wind_speed": ("agg", "AVG(wind_spd)", "Mean wind speed (m/s)"),
    "wind_gust": ("agg", "MAX(wind_gust)", "Max wind gust (m/s)"),
    "pressure": ("agg", "AVG(press_bmx)", "Mean pressure (hPa)"),
}


def refresh_dates_for_window(window: str) -> tuple[str, str]:
    """Return inclusive UTC dates for a frontend-selected refresh window."""
    if window not in REFRESH_WINDOWS:
        raise ValueError(f"window must be one of {sorted(REFRESH_WINDOWS)}")
    end = utc_now().date()
    start = end - timedelta(days=CALENDAR_DAY_COUNTS[window] - 1)
    return start.isoformat(), end.isoformat()

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

SITE_METADATA = {
    "id": "jkuat-iot-aws-61",
    "name": "JKUAT IOT AWS",
    "locality": "Juja",
    "county": "Kiambu",
    "country": "Kenya",
    "latitude": -1.099736,
    "longitude": 37.014528,
}


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
        "site": SITE_METADATA,
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
        "site": SITE_METADATA,
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
                "endpoints": ["/api/current-risk", "/api/trends", "/api/risk-distribution", "/api/alerts",
                              "/api/llm-providers", "/api/llm-advice", "/api/data-transparency", "/api/refresh"]}

    # ------------------------------------------------------------------
    @app.get("/api/current-risk")
    def current_risk(conn=Depends(get_db)):
        """Current risk: serves the latest persisted evaluation; computes and stores one on first call."""
        row = _latest_evaluation_row(conn)
        current_rules_version = load_thresholds()["version"]
        if row is None or row["rules_version"] != current_rules_version:
            result = run_evaluation(conn)
            return _result_payload(result)
        return _evaluation_payload(row)

    # ------------------------------------------------------------------
    @app.get("/api/trends")
    def trends(
        metric: str = Query(..., description="rainfall|temperature|humidity|wind_speed|wind_gust|pressure|risk_score"),
        period: str = Query("day", description="day|week|month|three_months"),
        at: str | None = Query(None, description="Look back as of this UTC time (ISO 8601); defaults to latest observation"),
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
            latest = latest_observation_time(conn)
            at_dt = parse_utc(at) if at else (parse_utc(latest) if latest else utc_now())
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"Cannot parse at: {at!r}")

        since = fmt_utc(at_dt - TREND_PERIODS[period])
        until = fmt_utc(at_dt)
        bucket = TREND_BUCKETS[period]
        bucket_len = 10 if bucket == "day" else 13  # 'YYYY-MM-DD' vs 'YYYY-MM-DDTHH'

        if metric == "risk_score":
            rules_version = load_thresholds()["version"]
            sql = (
                f"SELECT substr(window_end_utc, 1, {bucket_len}) AS b, AVG(risk_score) AS v "
                "FROM risk_evaluations WHERE window_end_utc >= ? AND window_end_utc <= ? "
                "AND rules_version = ? "
                "GROUP BY b ORDER BY b"
            )
            rows = conn.execute(sql, (since, until, rules_version)).fetchall()
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
            "bucket": bucket,
            "points": [
                {"t": r["b"], "value": round(r["v"], 3) if r["v"] is not None else None}
                for r in rows
            ],
        }

    # ------------------------------------------------------------------
    @app.get("/api/risk-distribution")
    def risk_distribution(
        period: str = Query("week", description="day|week|month|three_months"),
        at: str | None = Query(None, description="区间结束 UTC 时间；默认使用最新观测"),
        conn=Depends(get_db),
    ):
        """Daily High/Medium/Low probabilities for the selected time range."""
        if period not in REFRESH_WINDOWS:
            raise HTTPException(
                status_code=400,
                detail=f"period must be one of {sorted(REFRESH_WINDOWS)}",
            )
        try:
            latest = latest_observation_time(conn)
            at_dt = parse_utc(at) if at else (parse_utc(latest) if latest else utc_now())
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"Cannot parse at: {at!r}")

        day_count = CALENDAR_DAY_COUNTS[period]
        since_date = at_dt.date() - timedelta(days=day_count - 1)
        since_dt = at_dt.replace(
            year=since_date.year,
            month=since_date.month,
            day=since_date.day,
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        # Backfill is idempotent: one row per daily final observation/rules version.
        cfg = load_thresholds()
        run_daily_evaluations(conn, start_utc=since_dt, end_utc=at_dt, thresholds=cfg)
        raw_rows = conn.execute(
            "SELECT window_end_utc, risk_score, risk_level, confidence "
            "FROM risk_evaluations WHERE window_end_utc >= ? AND window_end_utc <= ? "
            "AND rules_version = ? "
            "ORDER BY window_end_utc",
            (fmt_utc(since_dt), fmt_utc(at_dt), cfg["version"]),
        ).fetchall()
        # Keep exactly one result per calendar day even if an older database
        # contains additional ad-hoc intraday evaluations.
        by_day = {row["window_end_utc"][:10]: row for row in raw_rows}
        rows = [by_day[day] for day in sorted(by_day)]
        counts = {"High": 0, "Medium": 0, "Low": 0}
        for row in rows:
            if row["risk_level"] in counts:
                counts[row["risk_level"]] += 1
        total = sum(counts.values())
        levels = [
            {
                "level": level,
                "count": counts[level],
                "probability": round(counts[level] * 100 / total, 1) if total else 0.0,
            }
            for level in ("High", "Medium", "Low")
        ]
        return {
            "period": period,
            "from": fmt_utc(since_dt),
            "to": fmt_utc(at_dt),
            "total_days": total,
            "levels": levels,
            "daily": [
                {
                    "date": row["window_end_utc"][:10],
                    "window_end_utc": row["window_end_utc"],
                    "risk_score": row["risk_score"],
                    "risk_level": row["risk_level"],
                    "confidence": row["confidence"],
                }
                for row in rows
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
                "location": SITE_METADATA,
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
                "scoring_method": "Continuous weighted 0-100 sensor-severity index",
                "continuous_scoring": cfg["continuous_scoring"],
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
    @app.get("/api/llm-advice")
    def llm_advice(
        force: bool = Query(False, description="Bypass the cache and regenerate the advice"),
        conn=Depends(get_db),
    ):
        """Flexible role advice from an optional DeepSeek LLM, grounded in the latest evaluation.

        The rule engine stays authoritative for score/level/triggers; the LLM
        only rewrites the advice layer.  Whenever the LLM is not configured or
        the call fails, the fixed rule-engine templates are served instead, so
        this endpoint never fails because of the LLM.
        """
        row = _latest_evaluation_row(conn)
        if row is None:
            raise HTTPException(status_code=404,
                                detail="No evaluation yet; call /api/current-risk first")
        evaluation = _evaluation_payload(row)
        templates = evaluation.pop("recommendations")
        evaluation.pop("site", None)
        result = llm_service.generate_advice(conn, evaluation, force_refresh=force)
        if result is None:
            return {
                "enabled": False,
                "source": "template",
                "window_end_utc": evaluation["window_end_utc"],
                "risk_score": evaluation["risk_score"],
                "risk_level": evaluation["risk_level"],
                "advice": templates,
                "message": ("Flexible LLM advice is disabled; set MAJIGUARD_DEEPSEEK_API_KEY "
                            "to enable it. Fixed rule-engine templates are served instead."),
            }
        if result["source"] == "error":
            return {
                "enabled": True,
                "source": "template",
                "degraded": True,
                "detail": result.get("detail"),
                "window_end_utc": evaluation["window_end_utc"],
                "risk_score": evaluation["risk_score"],
                "risk_level": evaluation["risk_level"],
                "advice": templates,
            }
        return {
            "enabled": True,
            "source": result["source"],
            "model": result["model"],
            "window_end_utc": evaluation["window_end_utc"],
            "risk_score": evaluation["risk_score"],
            "risk_level": evaluation["risk_level"],
            "advice": result["advice"],
        }

    # ------------------------------------------------------------------
    @app.get("/api/llm-providers")
    def llm_providers():
        """Catalog for the frontend model picker (bring-your-own-key flow)."""
        return {"providers": public_provider_list()}

    @app.post("/api/llm-advice")
    def llm_advice_byok(payload: LlmAdviceRequest, conn=Depends(get_db)):
        """Flexible advice generated with a VISITOR-SUPPLIED provider key.

        Bring-your-own-key: the request carries the provider id and the
        visitor's own API key.  The key is held in memory for this request
        only - never logged, cached, or persisted - so a public deployment
        never spends the team's tokens on behalf of others.

        Provider failures return HTTP 200 with ``source: "error"`` and a
        stable ``error_kind`` (invalid_api_key / insufficient_balance /
        rate_limited / timeout / network_error / provider_error) plus an
        English ``error_message``; the UI renders its own localized copy
        and keeps showing the rule-engine templates.
        """
        try:
            provider = llm_service.get_provider(payload.provider)
        except KeyError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not payload.api_key or not payload.api_key.strip():
            raise HTTPException(status_code=400, detail="api_key is required")

        row = _latest_evaluation_row(conn)
        if row is None:
            raise HTTPException(status_code=404,
                                detail="No evaluation yet; call /api/current-risk first")
        evaluation = _evaluation_payload(row)
        evaluation.pop("recommendations", None)
        evaluation.pop("site", None)

        result = llm_service.generate_advice_byok(
            conn, evaluation, payload.provider, payload.api_key, payload.model,
        )
        if result["source"] == "error":
            return {
                "source": "error",
                "provider": result["provider"],
                "provider_label": result["provider_label"],
                "model": result["model"],
                "error_kind": result["error_kind"],
                "error_message": result["error_message"],
                "detail": result.get("detail"),
                "window_end_utc": evaluation["window_end_utc"],
                "risk_score": evaluation["risk_score"],
                "risk_level": evaluation["risk_level"],
                "advice": None,
            }
        return {
            "source": result["source"],
            "provider": result["provider"],
            "provider_label": result["provider_label"],
            "model": result["model"],
            "window_end_utc": evaluation["window_end_utc"],
            "risk_score": evaluation["risk_score"],
            "risk_level": evaluation["risk_level"],
            "advice": result["advice"],
        }

    # ------------------------------------------------------------------
    @app.post("/api/refresh")
    def refresh(
        source: str | None = Query(None, description="Demo：本地 CSV/目录路径"),
        fromdate: str | None = Query(None, description="Conduit 起始日期，例如 2026-09-01"),
        todate: str | None = Query(None, description="Conduit 结束日期，例如 2026-09-02"),
        window: str | None = Query(None, description="Conduit 数据窗口：day|week|month|three_months"),
        conn=Depends(get_db),
    ):
        """刷新风险：本地 CSV Demo 或受保护的 Conduit POST 拉取。"""
        if source and (fromdate or todate or window):
            raise HTTPException(status_code=400, detail="source 不能与 Conduit 日期或 window 同时使用")
        if window and (fromdate or todate):
            raise HTTPException(status_code=400, detail="window 不能与 fromdate/todate 同时使用")
        if window:
            try:
                fromdate, todate = refresh_dates_for_window(window)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        elif bool(fromdate) != bool(todate):
            raise HTTPException(status_code=400, detail="fromdate 和 todate 必须同时提供")
        if fromdate and todate:
            try:
                refreshed = refresh_from_conduit(conn, fromdate, todate)
                refreshed["evaluation"] = _result_payload(refreshed["evaluation"])
                return refreshed
            except (ConduitClientError, ValueError) as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
        ingest_summary = None
        if source:
            ingest_summary = ingest_csv(conn, source)
        daily_results = run_daily_evaluations(conn)
        result = run_evaluation(conn)
        return {
            "ingest": ingest_summary,
            "evaluation": _result_payload(result),
            "daily_evaluations": len(daily_results),
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
