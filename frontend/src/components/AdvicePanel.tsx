import { useEffect, useRef, useState } from 'react'
import type { AudienceRole, Evaluation, LlmAdviceResponse, RoleAdvice } from '../types/api'
import { getLlmAdvice } from '../api/client'
import { ROLE_LABEL, t } from '../lib/format'

const ROLES: AudienceRole[] = ['residents', 'farmers', 'managers']

type AdviceMode = 'rule' | 'ai'

function ModeSwitch({ mode, onChange }: { mode: AdviceMode; onChange: (m: AdviceMode) => void }) {
  const item = (value: AdviceMode, label: string, sub: string) => (
    <button
      key={value}
      type="button"
      onClick={() => onChange(value)}
      className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
        mode === value
          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
      <span className="ml-1.5 whitespace-nowrap text-[10px] font-normal text-slate-400">{sub}</span>
    </button>
  )
  return (
    <div className="flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
      {item('rule', 'Rule-based', 'template')}
      {item('ai', 'AI advice', 'DeepSeek')}
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
  const [advice, setAdvice] = useState<LlmAdviceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestedWindow = useRef<string | null>(null)

  // AI advice is generated server-side with the team's DeepSeek key — no
  // visitor credentials involved.  Fetch it automatically the first time the
  // visitor opens AI mode; a new evaluation window triggers a fresh fetch.
  useEffect(() => {
    if (mode !== 'ai') return
    if (requestedWindow.current === evaluation.window_end_utc) return
    let cancelled = false
    requestedWindow.current = evaluation.window_end_utc
    setLoading(true)
    setError(null)
    getLlmAdvice()
      .then((res) => {
        if (!cancelled) setAdvice(res)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Request failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, evaluation.window_end_utc])

  async function regenerate() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await getLlmAdvice(true)
      setAdvice(res)
      requestedWindow.current = evaluation.window_end_utc
    } catch (err) {
      setError((err as Error).message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  // When the model succeeds the server answers with per-role {summary, actions};
  // on the template fallback each role maps to a plain string list instead.
  function isRoleAdviceMap(
    a: LlmAdviceResponse['advice'],
  ): a is Record<AudienceRole, RoleAdvice> {
    const first = a.residents
    return typeof first === 'object' && first !== null && 'summary' in first
  }

  const llmAdvice =
    mode === 'ai' && advice && (advice.source === 'llm' || advice.source === 'llm-cache') && isRoleAdviceMap(advice.advice)
      ? advice.advice
      : null
  const roleAdvice = llmAdvice ? llmAdvice[role] : null
  const templateItems = evaluation.recommendations[role] ?? []
  const degraded = mode === 'ai' && advice?.source === 'template'
  const staleWindow =
    mode === 'ai' && requestedWindow.current !== null && requestedWindow.current !== evaluation.window_end_utc

  return (
    <section className="glass-panel rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur lg:col-span-3 lg:h-[492px] lg:overflow-y-auto lg:overscroll-contain">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-md ${mode === 'ai' && llmAdvice ? 'bg-gradient-to-br from-violet-600 to-fuchsia-700 shadow-violet-500/25' : 'bg-gradient-to-br from-amber-600 to-stone-800 shadow-amber-900/20'}`}>
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
                ? 'bg-gradient-to-r from-amber-700 to-stone-800 text-white shadow-md shadow-amber-900/20'
                : 'text-stone-600 hover:bg-amber-50'
            }`}
          >
            {ROLE_LABEL[item]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-4 rounded-xl bg-violet-50/70 p-3 text-xs text-violet-800 ring-1 ring-violet-100">
          Asking DeepSeek for tailored guidance…
        </p>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/80 p-4">
          <div className="flex items-start gap-2.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-red-500">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-700">Could not load AI advice: {error}</p>
              <button
                type="button"
                onClick={() => void regenerate()}
                className="mt-2 text-xs font-medium text-red-600 underline underline-offset-2 hover:text-red-700"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {llmAdvice && roleAdvice ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>
              </svg>
              AI-generated
            </span>
            {advice?.model ? (
              <span className="text-[10px] font-mono text-slate-400">{advice.model}</span>
            ) : null}
            {advice?.source === 'llm-cache' ? (
              <span className="text-[10px] text-slate-400">cached for this evaluation window</span>
            ) : null}
            <button
              type="button"
              onClick={() => void regenerate()}
              disabled={loading}
              className="ml-auto text-[11px] font-medium text-violet-600 underline underline-offset-2 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
          <p className="rounded-xl bg-stone-100/80 p-3.5 text-sm leading-relaxed text-stone-800 ring-1 ring-amber-900/10">
            {roleAdvice.summary}
          </p>
          <ul className="space-y-3">
            {roleAdvice.actions.map((text, idx) => (
              <li key={idx} className="flex gap-3 rounded-xl bg-stone-100/80 p-3.5 ring-1 ring-amber-900/10 transition-all hover:bg-stone-200/75">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-stone-700 to-stone-900 text-[11px] font-bold text-white shadow-sm">
                  {idx + 1}
                </span>
                <span className="text-sm leading-relaxed text-stone-800">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {degraded && !loading ? (
        <p className="mt-4 rounded-xl bg-amber-50/80 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-100">
          The AI model is temporarily unavailable
          {advice?.detail ? ` (${advice.detail})` : ''}
          {' — '}showing rule-based guidance instead.
        </p>
      ) : null}

      {staleWindow && !loading ? (
        <button
          type="button"
          onClick={() => void regenerate()}
          className="mt-4 text-xs font-medium text-violet-600 underline underline-offset-2 hover:text-violet-700"
        >
          New evaluation window — refresh AI advice
        </button>
      ) : null}

      {!llmAdvice && !loading ? (
        <>
          <p className="mt-3 rounded-xl bg-stone-100/80 p-3 text-xs leading-relaxed text-stone-800 ring-1 ring-amber-900/10">
            Guidance for decision-making, not mandatory instructions. Always combine with local conditions and official management notices.
          </p>
          <ul className="mt-5 space-y-3">
            {templateItems.map((text, idx) => (
              <li key={idx} className="flex gap-3 rounded-xl bg-stone-100/80 p-3.5 ring-1 ring-amber-900/10 transition-all hover:bg-stone-200/75">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-stone-700 to-stone-900 text-[11px] font-bold text-white shadow-sm">
                  {idx + 1}
                </span>
                <span className="text-sm leading-relaxed text-stone-800">{t(text)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
