# app/llm — Flexible LLM advice layer (DeepSeek)

This folder isolates everything that connects MajiGuard to an external
large-language-model provider. The deterministic rule engine
(`app/engine.py` + `config/risk_thresholds.json`) stays the **single source
of truth** for the risk score, level and triggered rules; this layer can
only rewrite the **advice** shown to each role.

## Files

| File | Responsibility |
|---|---|
| `config.py` | Reads env vars: `MAJIGUARD_DEEPSEEK_API_KEY` (required to enable), `MAJIGUARD_DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`), `MAJIGUARD_DEEPSEEK_MODEL` (default `deepseek-chat`), `MAJIGUARD_LLM_TIMEOUT_SECONDS` (default `30`). |
| `prompts.py` | The grounding system prompt (hard rules: only use provided facts, never change score/level, water-guidance scope only, JSON-only output) + the compact JSON evaluation-context builder. |
| `client.py` | Thin `POST {base_url}/chat/completions` call (OpenAI-compatible, `response_format: json_object`). Tests inject a fake client — no network. |
| `advice.py` | `parse_advice()` strictly validates `{role: {summary, actions[]}}` for all three roles; anything malformed raises `LLMAdvisorError`. |
| `cache.py` | `llm_advice_cache` table (keyed by `rules_version | window_end_utc | model`) so repeated dashboard calls don't re-spend tokens. |
| `service.py` | `generate_advice()` orchestration: cache hit → `llm-cache`; miss → provider call → validate → cache; any failure → structured `error` result. Never raises. |

## Data flow

```text
latest risk_evaluations row (score, level, confidence, triggers, features, quality)
        |
        v
prompts.build_messages()      grounded system contract + JSON context
        |
        v
client.call_chat_completion() DeepSeek /chat/completions
        |
        v
advice.parse_advice()         strict {residents|farmers|managers} validation
        |
        v
cache.write_cache()           reuse until the evaluation or model changes
        |
        v
service.generate_advice() -> {"source": "llm" | "llm-cache", "advice": {...}}
        |
        -- any failure --> {"source": "error", "detail": ...}
        -- no API key --> None
                    (API layer serves fixed templates instead)
```

## Usage

```bash
# enable (never commit the real key)
export MAJIGUARD_DEEPSEEK_API_KEY=sk-...

# the endpoint (see app/api.py)
GET /api/llm-advice            # LLM advice, or templates when disabled/failed
GET /api/llm-advice?force=true # bypass the cache and regenerate
```

## Why the templates remain the fallback

The hackathon demo must survive dead Wi-Fi, expired quotas and malformed
model output. When the layer is disabled or fails, `/api/llm-advice` serves
the fixed rule-engine templates and marks the response
(`enabled: false` / `degraded: true`), so the product degrades honestly
instead of breaking.

## Swapping providers

Any OpenAI-compatible chat endpoint works: point
`MAJIGUARD_DEEPSEEK_BASE_URL` at the new provider and set the matching
model name. Only `client.py` would need changes for a non-compatible API.
