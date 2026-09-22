import { useEffect, useRef, useState } from 'react'
import type { AudienceRole, ByokAdviceResponse, Evaluation, LlmProviderInfo } from '../types/api'
import { getLlmProviders, postLlmAdvice } from '../api/client'
import { ROLE_LABEL, t } from '../lib/format'

const ROLES: AudienceRole[] = ['residents', 'farmers', 'managers']

type AdviceMode = 'rule' | 'ai'

// Localized copy for each backend error kind.  The backend also sends an
// English error_message; the UI prefers these shorter, user-facing strings.
const ERROR_COPY: Record<string, string> = {
  invalid_api_key: '未知API key：模型供应商拒绝了这把 key，请检查后重试。',
  insufficient_balance: '额度不够：该供应商账户余额或配额不足，请充值或更换模型。',
  rate_limited: '请求过于频繁：供应商正在限流，请稍后再试。',
  timeout: '请求超时：供应商响应太慢，请重试。',
  network_error: '网络错误：无法连接到模型供应商，请检查网络后重试。',
  provider_error: '供应商返回异常：请稍后重试。',
  bad_response: '模型返回内容无法解析：请重试。',
}

function ModeSwitch({ mode, onChange }: { mode: AdviceMode; onChange: (m: AdviceMode) => void }) {
  const item = (value: AdviceMode, label: string, sub: string) => (
    <button
      key={value}
      type="button"
      onClick={() => onChange(value)}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
        mode === value
          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
      <span className="ml-1.5 text-[10px] font-normal text-slate-400">{sub}</span>
    </button>
  )
  return (
    <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
      {item('rule', 'Rule-based', '固定建议')}
      {item('ai', 'AI advice', 'AI 建议')}
    </div>
  )
}

function KeyForm({
  providers,
  providerId,
  onProviderChange,
  apiKey,
  onKeyChange,
  onSubmit,
  loading,
}: {
  providers: LlmProviderInfo[]
  providerId: string
  onProviderChange: (id: string) => void
  apiKey: string
  onKeyChange: (key: string) => void
  onSubmit: () => void
  loading: boolean
}) {
  const selected = providers.find((p) => p.id === providerId)
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-xs font-medium text-slate-700">Connect your own model account</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
        Your key stays in your browser and is sent only with this single request — it is never
        stored on the server. 使用你自己的模型 API key，仅本次请求使用，不会被服务器存储。
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
        <select
          value={providerId}
          onChange={(e) => onProviderChange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
          aria-label="AI model provider"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onKeyChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && apiKey.trim() && !loading) onSubmit()
          }}
          placeholder={`API key (${selected?.key_hint ?? 'paste your key'})`}
          autoComplete="off"
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
          aria-label="Provider API key"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || !apiKey.trim()}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-violet-500/25 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {selected ? (
        <p className="mt-2 text-[10px] font-mono text-slate-400">model: {selected.default_model}</p>
      ) : null}
    </div>
  )
}

function ErrorNotice({ response, onBackToKey }: { response: ByokAdviceResponse; onBackToKey: () => void }) {
  const copy = ERROR_COPY[response.error_kind ?? 'provider_error'] ?? ERROR_COPY.provider_error
  return (
    <div className="mt-4 rounded-xl border border-red-200 bg-red-50/80 p-4">
      <div className="flex items-start gap-2.5">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-red-500">
          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-medium text-red-700">{copy}</p>
          <p className="mt-1 text-xs text-red-500/90">
            {response.provider_label} · {response.model}
            {response.detail ? ` · ${response.detail}` : ''}
          </p>
          <button
            type="button"
            onClick={onBackToKey}
            className="mt-2 text-xs font-medium text-red-600 underline underline-offset-2 hover:text-red-700"
          >
            修改 key 后重试 / Edit key and retry
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdvicePanel({
  evaluation,
  role,
  onRoleChange,
}: {
  evaluation: Evaluation
  role: AudienceRole
  onRoleChange: (role: AudienceRole) => void
}) {
  const [mode, setMode] = useState<AdviceMode>('rule')
  const [providers, setProviders] = useState<LlmProviderInfo[] | null>(null)
  const [providerId, setProviderId] = useState('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [advice, setAdvice] = useState<ByokAdviceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const requestedWindow = useRef<string | null>(null)

  // Load the provider catalog the first time the visitor opens AI mode.
  useEffect(() => {
    if (mode !== 'ai' || providers) return
    let cancelled = false
    getLlmProviders()
      .then((res) => {
        if (!cancelled) setProviders(res.providers)
      })
      .catch(() => {
        if (!cancelled) setProviders([])
      })
    return () => {
      cancelled = true
    }
  }, [mode, providers])

  // A new evaluation window invalidates previously generated advice.
  useEffect(() => {
    if (requestedWindow.current && requestedWindow.current !== evaluation.window_end_utc) {
      setAdvice(null)
    }
  }, [evaluation.window_end_utc])

  async function generate() {
    if (!apiKey.trim() || loading) return
    setLoading(true)
    requestedWindow.current = evaluation.window_end_utc
    try {
      const res = await postLlmAdvice({ provider: providerId, api_key: apiKey.trim() })
      setAdvice(res)
      if (res.source === 'error' && res.error_kind === 'invalid_api_key') setApiKey('')
    } catch {
      setAdvice({
        source: 'error',
        provider: providerId,
        provider_label: 'Provider',
        model: '',
        window_end_utc: evaluation.window_end_utc,
        risk_score: evaluation.risk_score,
        risk_level: evaluation.risk_level,
        error_kind: 'network_error',
        advice: null,
      })
    } finally {
      setLoading(false)
    }
  }

  const llmAdvice = mode === 'ai' && advice?.source === 'llm' ? advice.advice : null
  const roleAdvice = llmAdvice ? llmAdvice[role] : null
  const templateItems = evaluation.recommendations[role] ?? []
  const showError = mode === 'ai' && advice?.source === 'error' && !loading

  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-md ${mode === 'ai' && llmAdvice ? 'bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-violet-500/25' : 'bg-gradient-to-br from-sky-500 to-indigo-600 shadow-sky-500/25'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Action Guidance</h2>
            <p className="text-xs text-slate-500">Decision support — not mandatory instructions</p>
          </div>
        </div>
        <ModeSwitch mode={mode} onChange={setMode} />
      </div>

      <div className="mt-3 flex rounded-xl border border-slate-200 bg-white/80 p-0.5 shadow-sm backdrop-blur">
        {ROLES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onRoleChange(item)}
            className={`flex-1 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
              item === role
                ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {ROLE_LABEL[item]}
          </button>
        ))}
      </div>

      {mode === 'ai' ? (
        <KeyForm
          providers={providers ?? []}
          providerId={providerId}
          onProviderChange={(id) => {
            setProviderId(id)
            setAdvice(null)
          }}
          apiKey={apiKey}
          onKeyChange={setApiKey}
          onSubmit={() => void generate()}
          loading={loading}
        />
      ) : null}

      {loading ? (
        <p className="mt-4 rounded-xl bg-violet-50/70 p-3 text-xs text-violet-800 ring-1 ring-violet-100">
          Asking {advice?.provider_label ?? 'the AI model'} for tailored guidance…
        </p>
      ) : null}

      {showError && advice ? <ErrorNotice response={advice} onBackToKey={() => setAdvice(null)} /> : null}

      {llmAdvice && roleAdvice ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>
              </svg>
              AI-generated
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {advice?.provider_label} · {advice?.model}
            </span>
          </div>
          <p className="rounded-xl bg-violet-50/70 p-3.5 text-sm leading-relaxed text-slate-800 ring-1 ring-violet-100">
            {roleAdvice.summary}
          </p>
          <ul className="space-y-3">
            {roleAdvice.actions.map((text, idx) => (
              <li key={idx} className="flex gap-3 rounded-xl bg-slate-50/70 p-3.5 ring-1 ring-slate-100 transition-all hover:bg-slate-50">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-[11px] font-bold text-white shadow-sm">
                  {idx + 1}
                </span>
                <span className="text-sm leading-relaxed text-slate-800">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!llmAdvice && !loading ? (
        <>
          <p className="mt-3 rounded-xl bg-sky-50/70 p-3 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-100">
            {mode === 'ai' && providers && providers.length === 0
              ? 'The provider catalog is unavailable right now — rule-based guidance is shown.'
              : 'Guidance for decision-making, not mandatory instructions. Always combine with local conditions and official management notices.'}
          </p>
          <ul className="mt-5 space-y-3">
            {templateItems.map((text, idx) => (
              <li key={idx} className="flex gap-3 rounded-xl bg-slate-50/70 p-3.5 ring-1 ring-slate-100 transition-all hover:bg-slate-50">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-[11px] font-bold text-white shadow-sm">
                  {idx + 1}
                </span>
                <span className="text-sm leading-relaxed text-slate-800">{t(text)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
