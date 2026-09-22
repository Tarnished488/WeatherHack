# app/llm — Flexible LLM advice layer (multi-provider, bring-your-own-key)

This folder isolates everything that connects MajiGuard to external
large-language-model providers. The deterministic rule engine
(`app/engine.py` + `config/risk_thresholds.json`) stays the **single source
of truth** for the risk score, level and triggered rules; this layer can
only rewrite the **advice** shown to each role.

## Files

| File | Responsibility |
|---|---|
| `config.py` | Server-side demo key via env vars: `MAJIGUARD_DEEPSEEK_API_KEY`, `MAJIGUARD_DEEPSEEK_BASE_URL`, `MAJIGUARD_DEEPSEEK_MODEL`, `MAJIGUARD_LLM_TIMEOUT_SECONDS`. Used only by the GET endpoint. |
| `providers.py` | **BYOK registry**: 6 providers (chatgpt, grok, gemini, claude, deepseek, glm) with `base_url`, `default_model` and wire-protocol `style` (openai / anthropic / gemini). |
| `prompts.py` | The grounding system prompt (hard rules: only use provided facts, never change score/level, water-guidance scope only, JSON-only output) + the compact JSON evaluation-context builder. |
| `client.py` | Protocol dispatch: OpenAI-compatible `/chat/completions`, Anthropic `/v1/messages`, Gemini `:generateContent`. `classify_provider_error()` maps HTTP status/transport failures onto stable error kinds. Tests inject a fake client — no network. |
| `advice.py` | `extract_json_object()` tolerates markdown fences/prose; `parse_advice()` strictly validates `{role: {summary, actions[]}}` for all three roles; anything malformed raises `LLMAdvisorError`. |
| `cache.py` | `llm_advice_cache` table (keyed by `rules_version | window_end_utc | model`) — **server-key path only**; BYOK results are never cached. |
| `service.py` | `generate_advice()` (server key: cache → call → fallback) and `generate_advice_byok()` (visitor key: call → validate; failures become `{source: "error", error_kind, error_message}`). Neither raises. |

## Two paths

```text
GET /api/llm-advice          team demo: server-side DeepSeek key from env,
                             results cached in llm_advice_cache

POST /api/llm-advice         public BYOK flow: body {provider, api_key, model?}
                             visitor supplies their own key for one request;
                             the key is held in memory only — never logged,
                             cached, or persisted — and results are not
                             written to the shared cache

GET /api/llm-providers       catalog for the frontend model picker
```

Error mapping (POST, returned as HTTP 200 with `source: "error"` so the UI
can render inline):

| error_kind | Trigger | UI copy (zh) |
|---|---|---|
| `invalid_api_key` | HTTP 401/403, Gemini 400 with key error | 未知API key |
| `insufficient_balance` | HTTP 402 (e.g. DeepSeek no quota) | 额度不够 |
| `rate_limited` | HTTP 429 | 请求过于频繁 |
| `timeout` / `network_error` | transport failures | 超时 / 网络错误 |
| `provider_error` | anything else | 供应商异常 |

## Data flow

```text
latest risk_evaluations row (score, level, confidence, triggers, features, quality)
        |
        v
prompts.build_messages()      grounded system contract + JSON context
        |
        v
client.call_chat_completion()  dispatched by provider style
        |
        v
advice.parse_advice()          strict {residents|farmers|managers} validation
        |
        v
service.* -> {"source": "llm", "advice": {...}} | {"source": "error", ...}
        |
        -- server path failure --> API serves fixed templates (degraded)
        -- BYOK failure -------> API returns error payload for inline display
```

## Why the templates remain the fallback

The hackathon demo must survive dead Wi-Fi, expired quotas and malformed
model output. When the server-key layer is disabled or fails, the GET
endpoint serves the fixed rule-engine templates and marks the response
(`enabled: false` / `degraded: true`), so the product degrades honestly
instead of breaking. In the BYOK flow the UI keeps showing the templates
and renders the error next to the key input instead.
