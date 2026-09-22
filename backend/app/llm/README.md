# app/llm — Flexible LLM advice layer (server-side DeepSeek key)

This folder isolates everything that connects MajiGuard to external
large-language-model providers. The deterministic rule engine
(`app/engine.py` + `config/risk_thresholds.json`) stays the **single source
of truth** for the risk score, level and triggered rules; this layer can
only rewrite the **advice** shown to each role.

Deployment decision: visitors never type an API key. The AI advice on the
dashboard is generated server-side with the key configured in `config.py`
(`DEMO_API_KEY`, ships **empty**). The teammate taking over this layer fills
in their provider key there (or exports `MAJIGUARD_DEEPSEEK_API_KEY`);
until then the dashboard serves the fixed rule-engine templates.

## Files

| File | Responsibility |
|---|---|
| `config.py` | Provider settings: `MAJIGUARD_DEEPSEEK_API_KEY` (defaults to the baked-in `DEMO_API_KEY`), `MAJIGUARD_DEEPSEEK_BASE_URL`, `MAJIGUARD_DEEPSEEK_MODEL`, `MAJIGUARD_LLM_TIMEOUT_SECONDS`. |
| `providers.py` | Provider registry (chatgpt, grok, gemini, claude, deepseek, glm) with `base_url`, `default_model` and wire-protocol `style` (openai / anthropic / gemini). Retained for future provider switches. |
| `prompts.py` | The grounding system prompt (hard rules: only use provided facts, never change score/level, water-guidance scope only, JSON-only output) + the compact JSON evaluation-context builder. |
| `client.py` | Protocol dispatch: OpenAI-compatible `/chat/completions`, Anthropic `/v1/messages`, Gemini `:generateContent`. `classify_provider_error()` maps HTTP status/transport failures onto stable error kinds. Tests inject a fake client — no network. |
| `advice.py` | `extract_json_object()` tolerates markdown fences/prose; `parse_advice()` strictly validates `{role: {summary, actions[]}}` for all three roles; anything malformed raises `LLMAdvisorError`. |
| `cache.py` | `llm_advice_cache` table (keyed by `rules_version | window_end_utc | model`) so repeated dashboard views do not burn tokens. |
| `service.py` | `generate_advice()` (cache → call → fallback) and `generate_advice_byok()` (kept for API compatibility; unused by the current frontend). Neither raises. |

## Endpoint

```text
GET /api/llm-advice          server-side key from config.py DEMO_API_KEY
                             (or MAJIGUARD_DEEPSEEK_API_KEY env var),
                             results cached in llm_advice_cache
```

On any failure (no key, provider error, malformed output) the GET endpoint
serves the fixed rule-engine templates instead and marks the response
(`enabled: false` / `degraded: true`), so the product degrades honestly
instead of breaking.

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
service.generate_advice() -> {"source": "llm", "advice": {...}} | {"source": "error", ...}
        |
        -- failure --> API serves fixed templates (degraded)
```

## Why the templates remain the fallback

The hackathon demo must survive dead Wi-Fi, expired quotas and malformed
model output. When the server-key layer is disabled or fails, the GET
endpoint serves the fixed rule-engine templates and marks the response,
keeping the dashboard useful in every condition.
