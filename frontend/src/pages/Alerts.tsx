import { useCallback, useMemo, useState } from 'react'
import { getAlerts } from '../api/client'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/StatusBanner'
import { TriggerList } from '../components/TriggerList'
import {
  errorMessage,
  formatNumber,
  formatUtc,
  LEVEL_CLASSES,
  LEVEL_LABEL,
  ROLE_LABEL,
  t,
} from '../lib/format'
import { useApi } from '../lib/useApi'
import type { AudienceRole, Evaluation, RiskLevel } from '../types/api'

const ROLES: AudienceRole[] = ['residents', 'farmers', 'managers']
const LEVELS: (RiskLevel | 'all')[] = ['all', 'High', 'Medium', 'Low']

function AlertCard({
  alert,
  role,
}: {
  alert: Evaluation
  role: AudienceRole | 'all'
}) {
  const visibleTriggers = alert.triggers.filter((trigger) => trigger.scope !== 'quality')
  const advice =
    role === 'all'
      ? ROLES.flatMap((item) => (alert.recommendations[item] ?? []).map((text) => `${ROLE_LABEL[item]}: ${t(text)}`))
      : (alert.recommendations[role] ?? []).map((text) => t(text))

  return (
    <article className="space-y-4 rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-lg shadow-slate-900/5 backdrop-blur transition-all hover:shadow-xl hover:shadow-slate-900/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${alert.risk_level === 'High' ? 'bg-rose-500' : alert.risk_level === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'} shadow-sm`} />
          <span className={`rounded-full border px-3.5 py-1 text-sm font-semibold shadow-sm ${LEVEL_CLASSES[alert.risk_level]}`}>
            {LEVEL_LABEL[alert.risk_level]} · Score {alert.risk_score}
          </span>
        </div>
        <p className="text-xs text-slate-500">Window end {formatUtc(alert.window_end_utc)}</p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
          Evaluated {formatUtc(alert.evaluated_at_utc)}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6Z"/>
          </svg>
          Rules {alert.rules_version}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          Confidence {formatNumber(alert.confidence, 2)}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
          </svg>
          {visibleTriggers.length} rule{visibleTriggers.length !== 1 ? 's' : ''} triggered
        </span>
      </div>
      <TriggerList triggers={visibleTriggers} />
      <div className="rounded-xl bg-slate-50/80 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Recommendations</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          {advice.map((text, idx) => (
            <li key={idx}>{text}</li>
          ))}
        </ul>
      </div>
    </article>
  )
}

export function AlertsPage() {
  const loader = useCallback(() => getAlerts(50), [])
  const { data, error, loading, reload } = useApi(loader)
  const [role, setRole] = useState<AudienceRole | 'all'>('all')
  const [level, setLevel] = useState<RiskLevel | 'all'>('all')

  const filtered = useMemo(() => {
    if (!data) return []
    return data.alerts.filter((a) => level === 'all' || a.risk_level === level)
  }, [data, level])

  const stats = useMemo(() => {
    if (!data) return null
    const counts: Record<RiskLevel, number> = { High: 0, Medium: 0, Low: 0 }
    data.alerts.forEach((a) => {
      counts[a.risk_level]++
    })
    return counts
  }, [data])

  if (loading && !data) return <LoadingBlock label="Loading alert history…" />
  if (error) {
    return <ErrorBlock title="Unable to retrieve alert history" detail={errorMessage(error)} onRetry={reload} />
  }
  if (!data || data.count === 0) {
    return (
      <EmptyBlock title="No evaluation records yet">
        The alerts endpoint returns evaluations already written by the backend pipeline.
      </EmptyBlock>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Alert History</h1>
          <p className="mt-1 text-sm text-slate-500">{data.count} total evaluations · each card is traceable to triggering rules and observed evidence.</p>
        </div>
      </div>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={`rounded-2xl border p-5 shadow-lg shadow-rose-900/5 transition-all hover:shadow-xl ${LEVEL_CLASSES.High}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">High-risk</p>
              <span className="h-2 w-2 rounded-full bg-rose-600" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold">{formatNumber(stats.High, 0)}</p>
            <p className="mt-0.5 text-xs opacity-70">evaluation{stats.High !== 1 ? 's' : ''}</p>
          </div>
          <div className={`rounded-2xl border p-5 shadow-lg shadow-amber-900/5 transition-all hover:shadow-xl ${LEVEL_CLASSES.Medium}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Medium-risk</p>
              <span className="h-2 w-2 rounded-full bg-amber-600" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold">{formatNumber(stats.Medium, 0)}</p>
            <p className="mt-0.5 text-xs opacity-70">evaluation{stats.Medium !== 1 ? 's' : ''}</p>
          </div>
          <div className={`rounded-2xl border p-5 shadow-lg shadow-emerald-900/5 transition-all hover:shadow-xl ${LEVEL_CLASSES.Low}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Low-risk</p>
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold">{formatNumber(stats.Low, 0)}</p>
            <p className="mt-0.5 text-xs opacity-70">evaluation{stats.Low !== 1 ? 's' : ''}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/60 bg-white/60 p-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <label className="text-sm font-medium text-slate-600">Risk level:</label>
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
            {LEVELS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLevel(item)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
                  level === item
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item === 'all' ? 'All' : LEVEL_LABEL[item]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="text-sm font-medium text-slate-600">Audience:</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AudienceRole | 'all')}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition-all hover:shadow focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          >
            <option value="all">All audiences</option>
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABEL[item]}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto text-xs text-slate-400">
          {filtered.length} of {data.alerts.length} shown
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-8 text-center backdrop-blur">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-slate-400">
              <circle cx="12" cy="12" r="10"/><path d="M8 15s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>
            </svg>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">No records match the current filters.</p>
          <p className="mt-1 text-xs text-slate-500">Try adjusting the risk level or audience.</p>
        </div>
      ) : (
        filtered.map((alert) => (
          <AlertCard
            key={`${alert.window_end_utc}-${alert.rules_version}-${alert.evaluated_at_utc}`}
            alert={alert}
            role={role}
          />
        ))
      )}
    </div>
  )
}
