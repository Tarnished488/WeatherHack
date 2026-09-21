"""Tests for the optional DeepSeek flexible-advice layer (app/llm/ package)."""
from __future__ import annotations

import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
import app.llm.service as llm_service
from app.llm import (
    LLMAdvisorError,
    build_messages,
    generate_advice,
    load_llm_config,
    parse_advice,
)
from app.pipeline import run_evaluation
from tests.conftest import insert_obs

UTC = __import__("datetime").timezone.utc
END = __import__("datetime").datetime(2026, 9, 15, 12, 0, 0, tzinfo=UTC)


def fmt(dt) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _evaluation() -> dict:
    return {
        "window_end_utc": "2026-09-15T12:00:00Z",
        "evaluated_at_utc": "2026-09-15T12:00:05Z",
        "rules_version": "test-1.0",
        "risk_score": 52.3,
        "risk_level": "Medium",
        "confidence": 0.86,
        "burst_alert": False,
        "triggers": [
            {
                "id": "dry_72h",
                "scope": "stress",
                "weight": 25,
                "description": "Low cumulative rainfall over the past 72 hours",
                "observed": {"rainfall_72h_mm": 0.2},
            }
        ],
        "recommendations": {
            "residents": ["Review non-essential water use"],
            "farmers": ["Review irrigation schedules"],
            "managers": ["Watch the dry trend"],
        },
        "features": {
            "rainfall_72h_mm": 0.2,
            "temp_max_24h_c": 29.4,
            "humidity_min_24h_pct": 33.1,
            "wind_gust_max_24h_ms": 8.7,
        },
        "quality": {
            "coverage_24h": 0.98,
            "invalid_ratio_24h": 0.0,
            "completeness_24h": 1.0,
            "staleness_minutes": 3.0,
            "window_end_utc": "2026-09-15T12:00:00Z",
            "evaluated_at_utc": "2026-09-15T12:00:05Z",
        },
    }


def _cfg(**overrides) -> dict:
    cfg = {
        "api_key": "test-key",
        "base_url": "https://api.deepseek.test",
        "model": "deepseek-chat",
        "timeout_seconds": 5.0,
        "enabled": True,
    }
    cfg.update(overrides)
    return cfg


class FakeResponse:
    def __init__(self, content: str, status: int = 200):
        self._content = content
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return {"choices": [{"message": {"content": self._content}}]}


class FakeClient:
    """Records the last request; returns a canned response."""

    def __init__(self, content: str = "", status: int = 200):
        self.calls = 0
        self.url = None
        self.payload = None
        self.headers = None
        self._response = FakeResponse(content, status)

    def post(self, url, json=None, headers=None):
        self.calls += 1
        self.url = url
        self.payload = json
        self.headers = headers
        return self._response


GOOD_CONTENT = json.dumps({
    "residents": {"summary": "Dry conditions are building; store water now.",
                  "actions": ["Store drinking water", "Fix leaking taps"]},
    "farmers": {"summary": "No rain for 72h; irrigate early.",
                "actions": ["Irrigate at dawn", "Mulch seedbeds"]},
    "managers": {"summary": "Consider a community water-saving notice.",
                 "actions": ["Check storage tanks", "Post a notice"]},
})


# ---------------------------------------------------------------------------
# Prompt / parsing
# ---------------------------------------------------------------------------

def test_build_messages_grounds_model_in_evaluation_facts():
    messages = build_messages(_evaluation())
    assert messages[0]["role"] == "system"
    assert "Never invent" in messages[0]["content"]
    assert "JSON only" in messages[0]["content"]
    context = json.loads(messages[1]["content"])
    assert context["risk_score"] == 52.3
    assert context["risk_level"] == "Medium"
    assert context["confidence"] == 0.86
    assert context["triggered_rules"][0]["id"] == "dry_72h"
    assert context["observed_features"]["rainfall_72h_mm"] == 0.2
    assert context["template_recommendations"]["residents"] == ["Review non-essential water use"]


def test_parse_advice_accepts_valid_payload():
    advice = parse_advice(GOOD_CONTENT)
    assert set(advice) == {"residents", "farmers", "managers"}
    assert advice["residents"]["summary"].startswith("Dry conditions")
    assert advice["farmers"]["actions"] == ["Irrigate at dawn", "Mulch seedbeds"]


@pytest.mark.parametrize("content", [
    "not json at all",
    json.dumps({"residents": {"summary": "x", "actions": ["a"]}}),          # missing roles
    json.dumps({"residents": {"actions": ["a"]}, "farmers": {}, "managers": {}}),
    json.dumps({r: {"summary": "s", "actions": []} for r in
                ("residents", "farmers", "managers")}),                      # empty actions
])
def test_parse_advice_rejects_invalid_payloads(content):
    with pytest.raises(LLMAdvisorError):
        parse_advice(content)


def test_load_llm_config_disabled_without_key(monkeypatch):
    for var in ("MAJIGUARD_DEEPSEEK_API_KEY", "MAJIGUARD_DEEPSEEK_BASE_URL",
                "MAJIGUARD_DEEPSEEK_MODEL", "MAJIGUARD_LLM_TIMEOUT_SECONDS"):
        monkeypatch.delenv(var, raising=False)
    cfg = load_llm_config()
    assert cfg["enabled"] is False
    assert cfg["base_url"] == "https://api.deepseek.com"
    assert cfg["model"] == "deepseek-chat"


# ---------------------------------------------------------------------------
# generate_advice: cache, fallback, error paths
# ---------------------------------------------------------------------------

def test_generate_advice_disabled_returns_none(conn):
    assert generate_advice(conn, _evaluation(), config=_cfg(enabled=False, api_key="")) is None


def test_generate_advice_success_then_cache_hit(conn):
    client = FakeClient(GOOD_CONTENT)
    first = generate_advice(conn, _evaluation(), config=_cfg(), client=client)
    assert first["source"] == "llm"
    assert first["model"] == "deepseek-chat"
    assert first["advice"]["managers"]["actions"] == ["Check storage tanks", "Post a notice"]
    assert client.calls == 1
    # Authorization header must carry the key; endpoint must be the chat path.
    assert client.headers["Authorization"] == "Bearer test-key"
    assert client.url == "https://api.deepseek.test/chat/completions"
    assert client.payload["model"] == "deepseek-chat"
    assert client.payload["response_format"] == {"type": "json_object"}

    second = generate_advice(conn, _evaluation(), config=_cfg(), client=client)
    assert second["source"] == "llm-cache"
    assert second["advice"] == first["advice"]
    assert client.calls == 1  # served from cache, no second HTTP call


def test_generate_advice_force_refresh_bypasses_cache(conn):
    client = FakeClient(GOOD_CONTENT)
    generate_advice(conn, _evaluation(), config=_cfg(), client=client)
    forced = generate_advice(conn, _evaluation(), config=_cfg(), client=client, force_refresh=True)
    assert forced["source"] == "llm"
    assert client.calls == 2
    # cache table holds exactly one row for this key (upsert, not duplicate)
    count = conn.execute("SELECT COUNT(*) FROM llm_advice_cache").fetchone()[0]
    assert count == 1


def test_generate_advice_http_error_degrades(conn):
    client = FakeClient("ignored", status=500)
    result = generate_advice(conn, _evaluation(), config=_cfg(), client=client)
    assert result["source"] == "error"
    assert result["advice"] is None
    assert "HTTP 500" in result["detail"]


def test_generate_advice_invalid_json_degrades(conn):
    client = FakeClient("this is not JSON")
    result = generate_advice(conn, _evaluation(), config=_cfg(), client=client)
    assert result["source"] == "error"
    assert result["advice"] is None


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

def seed_quiet_week(conn) -> None:
    for h in range(24 * 7):
        insert_obs(conn, fmt(END - timedelta(hours=h)),
                   rg1=0.0, rg2=0.0, temp_sht=20.0, humidity_sht=60.0,
                   wind_spd=1.0, wind_gust=3.0, press_bmx=852.0)


@pytest.fixture()
def client(conn):
    app = api_module.create_app()

    def _override():
        yield conn

    app.dependency_overrides[api_module.get_db] = _override
    with TestClient(app) as c:
        yield c


def test_llm_advice_without_key_serves_templates(conn, client, monkeypatch):
    seed_quiet_week(conn)
    run_evaluation(conn)
    monkeypatch.setattr(llm_service, "load_llm_config",
                        lambda: _cfg(enabled=False, api_key=""))
    resp = client.get("/api/llm-advice")
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is False
    assert body["source"] == "template"
    assert set(body["advice"]) == {"residents", "farmers", "managers"}
    assert "MAJIGUARD_DEEPSEEK_API_KEY" in body["message"]


def test_llm_advice_uses_llm_when_available(conn, client, monkeypatch):
    seed_quiet_week(conn)
    run_evaluation(conn)
    advice = parse_advice(GOOD_CONTENT)
    calls = {}

    def fake_generate(conn_, evaluation, *, config=None, client=None, force_refresh=False):
        calls["rules_version"] = evaluation["rules_version"]
        calls["window_end_utc"] = evaluation["window_end_utc"]
        return {"source": "llm", "model": "deepseek-chat", "advice": advice}

    monkeypatch.setattr(llm_service, "generate_advice", fake_generate)
    resp = client.get("/api/llm-advice")
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    assert body["source"] == "llm"
    assert body["model"] == "deepseek-chat"
    assert body["advice"]["residents"]["actions"] == ["Store drinking water", "Fix leaking taps"]
    assert calls["rules_version"]  # grounded in the latest persisted evaluation


def test_llm_advice_requires_evaluation(conn, client):
    resp = client.get("/api/llm-advice")
    assert resp.status_code == 404
