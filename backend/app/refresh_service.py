"""Application service for the live Conduit refresh workflow."""
from __future__ import annotations

from .conduit_client import fetch_conduit_payload
from .conduit_ingest import ingest_conduit_payload
from .pipeline import run_evaluation


def refresh_from_conduit(conn, fromdate: str, todate: str) -> dict:
    """Fetch -> validate/store -> evaluate.  Kept out of the HTTP route for testability."""
    response = fetch_conduit_payload(fromdate, todate)
    ingest_summary = ingest_conduit_payload(conn, response.payload, response.source)
    result = run_evaluation(conn)
    return {"ingest": ingest_summary, "evaluation": result}
