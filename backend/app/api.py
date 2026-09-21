"""FastAPI REST API for the MajiGuard frontend (PROJECT_PLAN step 4).

Endpoints (plan section 7, step 4):
    GET  /api/current-risk       latest persisted evaluation (auto-computes once)
    GET  /api/trends             metric time series (rainfall/temperature/...)
    GET  /api/alerts             evaluation / alert history
    GET  /api/data-transparency  data source, fields, rules version, limitations
    POST /api/refresh            dev/demo: optional re-ingest + re-evaluate

Run:
    python -m app.api            # docs at http://127.0.0.1:8000/docs

CORS: allow_origins defaults to "*" for the hackathon demo; restrict it via
the MAJIGUARD_CORS_ORIGINS env var (comma-separated) before real deployment.
Database path can be overridden with MAJIGUARD_DB.
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

API_DB_PATH = os.environ.get("MAJIGUARD_DB", str(DEFAULT_DB_PATH))
CORS_ORIGINS = [
    o.strip() for o in os.environ.get("MAJIGUARD_CORS_ORIGINS", "*").split(",") if o.strip()
]

TREND_PERIODS = {"24h": WINDOW_24H, "72h": WINDOW_72H, "7d": WINDOW_7D}

# metric -> (sql expression builder kind, column, description)
TREND_METRICS = {
    "rainfall": ("rain", None, "累计降雨 (mm)，rg1+rg2"),
    "temperature": ("agg", "AVG(temp_sht)", "平均气温 (°C)"),
    "humidity": ("agg", "AVG(humidity_sht)", "平均相对湿度 (%)"),
    "wind_speed": ("agg", "AVG(wind_spd)", "平均风速 (m/s)"),
    "wind_gust": ("agg", "MAX(wind_gust)", "最大阵风 (m/s)"),
    "pressure": ("agg", "AVG(press_bmx)", "平均气压 (hPa)"),
}

FIELD_DOCS = [
    ("rg1", "mm", "雨量计 1 逐分钟降雨"),
    ("rg2", "mm", "雨量计 2 逐分钟降雨"),
    ("temp_sht", "degC", "气温（SHT 传感器）"),
    ("humidity_sht", "%", "相对湿度（SHT 传感器）"),
    ("wind_spd", "m/s", "平均风速"),
    ("wind_gust", "m/s", "阵风风速"),
    ("press_bmx", "hPa", "大气压（BMP 传感器）"),
    ("heat_idx", "degC", "体感高温指数"),
    ("wet_bulb_temp", "degC", "湿球温度"),
    ("wet_bulb_globe_temp", "degC", "湿球黑球温度"),
    ("si1145_vis / si1145_ir / si1145_uv", "#", "可见光 / 红外 / 紫外读数"),
]

KNOWN_LIMITATIONS = [
    "阈值基于单一站点（JKUAT, Kiambu）2026-08 ~ 2026-09 约 3 周数据调优，尚未跨季节验证。",
    "不输出医疗、公共卫生或饮用水安全结论。",
    "不输出精确灌溉水量或作物专属建议。",
    "不提供权威洪水预测；降雨突增仅为储水/排水准备提醒。",
    "不假设数据中存在水质或水量字段。",
    "系统仅提供决策支持，不直接控制水泵、灌溉设备或公共基础设施。",
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
        description="社区用水压力风险与行动建议系统（Hack The Weather）",
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
        """当前风险：优先读最新持久化结果；库为空时现场计算并落库。"""
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
        at: str | None = Query(None, description="按此 UTC 时刻回看（ISO 8601），默认现在"),
        conn=Depends(get_db),
    ):
        """关键指标时间序列：24h/72h 按小时聚合，7d 按天聚合。"""
        if period not in TREND_PERIODS:
            raise HTTPException(status_code=400,
                                detail=f"period 必须是 {sorted(TREND_PERIODS)} 之一")
        if metric != "risk_score" and metric not in TREND_METRICS:
            raise HTTPException(
                status_code=400,
                detail=f"metric 必须是 {sorted(set(TREND_METRICS) | {'risk_score'})} 之一",
            )
        try:
            at_dt = parse_utc(at) if at else utc_now()
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"无法解析 at: {at!r}")

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
        """告警/评估历史：每条都带触发规则、证据特征与行动建议（可追溯）。"""
        rows = conn.execute(
            "SELECT * FROM risk_evaluations "
            "ORDER BY window_end_utc DESC, evaluated_at_utc DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return {"count": len(rows), "alerts": [_evaluation_payload(r) for r in rows]}

    # ------------------------------------------------------------------
    @app.get("/api/data-transparency")
    def data_transparency(conn=Depends(get_db)):
        """数据透明度页：来源、字段、清洗策略、规则版本与已知局限。"""
        cfg = load_thresholds()
        return {
            "data_source": {
                "name": "Conduit@Empathy1 环境站（3D FEWS NET / UCAR ICDP）",
                "site": "Kenya Kiambu, Site JKUAT IOT AWS",
                "doi": "https://doi.org/10.5065/d6v1236q",
                "sampling_interval": "1 分钟",
                "aggregation": "趋势接口按小时（24h/72h）或按天（7d）聚合",
            },
            "fields_used": [
                {"column": col, "unit": unit, "description": desc}
                for col, unit, desc in FIELD_DOCS
            ],
            "validation": {
                "policy": "越界或关键字段缺失 → is_valid=0 并写入 quality_flags_json，不删除数据",
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
                        "description_zh": r["description_zh"],
                    }
                    for r in cfg["rules"]
                ],
            },
            "known_limitations": KNOWN_LIMITATIONS,
        }

    # ------------------------------------------------------------------
    @app.post("/api/refresh")
    def refresh(source: str | None = Query(None, description="可选：重新导入的 CSV/目录路径"),
                conn=Depends(get_db)):
        """开发 / Demo 用：可选重新导入 CSV，然后重新评估并落库。"""
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
