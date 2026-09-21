"""Application service for the live Conduit refresh workflow."""
from __future__ import annotations

from datetime import datetime, time, timezone

from .conduit_client import fetch_conduit_payload
from .conduit_ingest import ingest_conduit_payload
from .pipeline import run_daily_evaluations, run_evaluation


def refresh_from_conduit(conn, fromdate: str, todate: str) -> dict:
    """Fetch -> validate/store -> evaluate every day in the requested range."""
    response = fetch_conduit_payload(fromdate, todate)
    ingest_summary = ingest_conduit_payload(conn, response.payload, response.source)
    start_utc = datetime.combine(datetime.fromisoformat(fromdate).date(), time.min, timezone.utc)
    end_utc = datetime.combine(datetime.fromisoformat(todate).date(), time.max, timezone.utc)
    daily_results = run_daily_evaluations(conn, start_utc=start_utc, end_utc=end_utc)
    result = run_evaluation(conn)
    return {
        "ingest": ingest_summary,
        "evaluation": result,
        "daily_evaluations": len(daily_results),
    }
