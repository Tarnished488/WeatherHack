# MajiGuard

**Community water-stress risk and action guidance — a Hack The Weather prototype.**

MajiGuard turns raw environmental observations from the official **Conduit@Empathy** station (JKUAT, Kiambu, Kenya) into clear, explainable, and prudent action advice. Instead of another raw weather chart, it answers one question: *given the last few hours and days of rainfall, temperature, humidity and wind — what should residents, farmers, and site managers actually do right now?*

---

## 1. Problem

Environmental sensor dashboards show numbers, not decisions. A chart of rain-gauge readings does not tell a farmer whether it is safe to delay irrigation, or tell a manager whether staff should limit outdoor work during a hot, dry spell. The gap between *raw observation* and *prudent action* is exactly where MajiGuard sits.

**Scope boundary (important):** the MVP only uses fields that actually exist in the official Conduit data. We do **not** claim to measure water quality, water volume, flood probability, actual crop water demand, or health risk. Those remain future directions until the data can support them.

## 2. Solution

MajiGuard converts recent Conduit observations into:

- **Risk Score (0–100)** — from a fully explainable rule engine, not a black box. Every point can be traced to a triggered rule.
- **Risk Level** — `Low` / `Medium` / `High` (band cutoffs: ≤29 / 30–59 / ≥60).
- **Confidence (0–1.0)** — penalised by low sampling coverage, flagged/invalid rows, missing critical features, and stale data, so consumers know how much to trust a result.
- **Triggered rules** — each with a human-readable description and role-specific recommendations.
- **Action recommendations** — separate guidance templates for *residents*, *farmers*, and *managers*.
- **Alert history & trends** — risk score over time, per-metric trends (rain / temperature / wind), and a data-transparency page for judges to verify exactly how Conduit data is used.

## 3. How we use Conduit data

| Used for | Fields | Notes |
|---|---|---|
| Rainfall windows (1h / 24h / 72h / 7d) | `rg1`, `rg2` | Per-interval tipping-bucket readings; window rain = SUM(rg1 + rg2) over valid rows. |
| Heat rules | `temp_sht`, `humidity_sht` | SHT temperature/humidity sensor as primary ambient inputs. |
| Wind rule | `wind_spd`, `wind_gust` | Gust used for the windy-and-hot rule; must be non-negative. |
| Quality / confidence | `is_valid`, `quality_flags_json`, timestamp cadence | Suspicious rows are **flagged, never silently deleted**; staleness and coverage feed the confidence score. |

Validation rules (ranges, negative values, humidity 0–100) are documented in [`backend/doc/data-dictionary.en.md`](backend/doc/data-dictionary.en.md). The known data anomaly (`wind_gust_dir` ≡ `wind_gust`) is explicitly excluded from calculations.

**Data source & attribution:** all observations come from the official **Conduit@Empathy** environmental data station (3DFEWSNET, Site JKUAT, Kiambu, Kenya), provided by the Hack The Weather organisers, sampled at ~15-minute intervals. We thank the Conduit team for making this data available. No other external data sources are used in the MVP.

## 4. Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12+, FastAPI, Uvicorn |
| Storage | SQLite (`weather_observations`, `fetch_runs`, `risk_evaluations`) |
| Rules / features | Pure-Python rule engine + SQL aggregation (no heavy deps) |
| Testing | Pytest (29 tests: features, engine, ingest, pipeline, API) |
| Frontend (planned) | React + TypeScript + Vite, Recharts, Tailwind CSS |

## 5. Architecture

```text
Official Conduit data (GeoCSV files  /  Conduit HTTP API)
        |
        v
Ingestion + validation (app/ingest.py, app/conduit_ingest.py)
   * flag suspicious rows (is_valid=0 + quality_flags_json), never delete
   * idempotent inserts (no duplicate timestamps)
        |
        v
SQLite (weather_observations, fetch_runs)
        |
        v
Feature extraction (app/features.py)
   * 1h / 24h / 72h / 7d rainfall, mean temp, max gust, coverage, staleness
        |
        v
Explainable rule engine (app/engine.py, config/risk_thresholds.json)
   * weighted rules -> Risk Score 0-100, Level, Confidence, Reasons, Advice
        |
        v
Pipeline + persistence (app/pipeline.py -> risk_evaluations, idempotent upsert)
        |
        v
FastAPI REST API (app/api.py)  -->  React Web Dashboard (planned)
```

## 6. Repository structure

```text
WheaterHack/
├── RainData/                        # Official Conduit GeoCSV exports (JKUAT station)
├── backend/
│   ├── app/
│   │   ├── db.py                    # SQLite connection + schema (idempotent)
│   │   ├── config.py                # Threshold config loader & validation
│   │   ├── ingest.py                # GeoCSV -> DB  (CLI: python -m app.ingest)
│   │   ├── conduit_client.py        # Authenticated Conduit HTTP API client
│   │   ├── conduit_ingest.py        # Conduit JSON -> DB (same validation rules)
│   │   ├── features.py              # Window aggregation & quality features
│   │   ├── engine.py                # Explainable rule engine
│   │   ├── pipeline.py              # evaluate -> persist (idempotent upsert)
│   │   ├── refresh_service.py       # fetch Conduit -> ingest -> re-evaluate
│   │   └── api.py                   # FastAPI app (5 endpoints)
│   ├── config/risk_thresholds.json  # Canonical rule/threshold config (v1.0.0)
│   ├── data/majiguard.db            # Local SQLite database (created on first run)
│   ├── doc/                         # Data dictionary & project plan
│   ├── tests/                       # Pytest suite (29 tests)
│   ├── tools/                       # Developer utilities (CSV inspect, dump evaluation)
│   ├── requirements.txt
│   └── .env.example
└── README.md
```

## 7. Getting started (backend)

Requires Python 3.10+ (developed on 3.12+).

```bash
cd backend

# 1. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Ingest the official Conduit CSVs (folder or single file both work)
python -m app.ingest --source ../RainData

# 3b. Alternative: pull recent data from the Conduit HTTP API (needs credentials, see §9)
# python -c "from app.db import connect; from app.refresh_service import refresh_from_conduit; \
#            c = connect('data/majiguard.db'); print(refresh_from_conduit(c, '2026-09-11', '2026-09-16'))"

# 4. Start the API
python -m app.api                # http://127.0.0.1:8000  (docs at /docs)

# 5. Run the test suite
python -m pytest
```

The first call to `GET /api/current-risk` automatically computes and persists an evaluation if the database has observations but no evaluation yet.

## 8. API endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/current-risk` | Latest risk evaluation (score, level, confidence, triggered rules, recommendations). Auto-computes once if none exists. |
| `GET` | `/api/trends` | Time-bucketed trends for `rainfall`, `temperature`, `wind`, `humidity`, or `risk_score`; `period=24h/72h/7d`. |
| `GET` | `/api/alerts` | Recent evaluations that reached `High` level, with triggered rules and advice. |
| `GET` | `/api/data-transparency` | Data source info, fields used, aggregation, rule version, known limitations. |
| `POST` | `/api/refresh` | Re-run the evaluation pipeline on the latest stored data. |

All responses are in English. Field semantics are documented inline at `/api/data-transparency`.

## 9. Configuration

Rules and thresholds live in [`backend/config/risk_thresholds.json`](backend/config/risk_thresholds.json) — the single source of truth for the engine:

| Rule | Trigger | Weight |
|---|---|---|
| `dry_72h` | 72h rainfall ≤ 2.0 mm | 25 |
| `dry_7d_baseline` | ≤1 rainy day in 7d | 10 |
| `hot_and_dry` | temp ≥ 30 °C **and** humidity ≤ 40 % | 25 |
| `hot_exposure` | temp ≥ 32 °C | 10 |
| `windy_and_hot` | gust ≥ 10 m/s **and** temp ≥ 28 °C | 10 |
| `rain_burst_1h` | 1h rainfall ≥ 5.0 mm | burst alert (separate preparedness warning, not added to score) |

Weighted rules sum to a maximum of 80; the score is scaled to 0–100. Level bands: `Low ≤ 29`, `Medium 30–59`, `High ≥ 60`.

**Confidence** starts at 1.0 and is penalised by: low sampling coverage (≤0.3), many flagged/invalid rows (≤0.5), missing critical features (−0.15 each), and stale data (warn >120 min, hard cap 0.3 beyond 720 min).

**Environment variables** (see [`backend/.env.example`](backend/.env.example)):

| Variable | Purpose |
|---|---|
| `MAJIGUARD_CONDUIT_ENDPOINT` | Conduit HTTP API endpoint (required for API ingestion) |
| `MAJIGUARD_CONDUIT_API_KEY` | Conduit API key — never commit a real key |
| `MAJIGUARD_CONDUIT_EMAIL` | Registered team email for the Conduit API |
| `MAJIGUARD_DB` | SQLite path (default `data/majiguard.db`) |
| `MAJIGUARD_CORS_ORIGINS` | Comma-separated allowed origins (default `http://localhost:5173`) |

## 10. Known limitations

- Risk rules are hand-tuned heuristics (v1.0.0) calibrated on the provided dry-season sample; they are decision *support*, not a forecast.
- `rg1tt/rg2tt/rg1tp/rg2tp` daily-total fields are stored but not yet used for rainfall derivation (daily-reset behaviour unverified).
- `wind_gust_dir` is excluded (source anomaly). SI1145 light channels are raw values, not lux/UV-index.
- No automated scheduling yet — evaluation runs on ingest or via `POST /api/refresh`.
- Confidence reflects data quality only; it does not quantify rule accuracy.

## 11. AI usage disclosure

This project was built with the assistance of AI coding tools (code generation, test scaffolding, and documentation drafting). All rules, thresholds, data-handling decisions, and the final deliverables were reviewed, tuned against the real Conduit dataset, and approved by the team. The data dictionary and scope boundaries were authored by the team based on direct inspection of the official data.

## 12. Team

- **Backend & risk engine** — Tarnished488 ([@Tarnished488](https://github.com/Tarnished488))
- **Data pipeline & Conduit integration** — *(add teammate)*
- **Frontend dashboard** — *(add teammate)*

## 13. Roadmap

- [ ] Scheduled auto-refresh (e.g. every 15 minutes) via APScheduler / cron, gated by data freshness
- [ ] React dashboard: current risk, trends, alerts, data-transparency page
- [ ] Verify `rg*tt/tp` daily-total semantics; adopt them for rainfall if validated
- [ ] Calibrate thresholds against a longer Conduit history (wet-season behaviour)
- [ ] Merge / reconcile the alternative FAO/WMO-weighted threshold draft with v1.0.0
- [ ] Optional: PostgreSQL, map view, lightweight anomaly detection

---

*Built for Hack The Weather. Data courtesy of Conduit@Empathy (3DFEWSNET, JKUAT site, Kiambu, Kenya).*
