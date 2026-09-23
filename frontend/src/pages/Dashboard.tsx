import { useCallback, useEffect, useState } from 'react'
import { getCurrentRisk } from '../api/client'
import { AdvicePanel } from '../components/AdvicePanel'
import { MetricCard } from '../components/MetricCard'
import { NationalRiskOverview } from '../components/NationalRiskOverview'
import { TriggerList } from '../components/TriggerList'
import { EmptyBlock, ErrorBlock, LoadingBlock, StatusBanner } from '../components/StatusBanner'
import { errorMessage, formatNumber, formatUtc, t, topStressTriggers } from '../lib/format'
import { useApi } from '../lib/useApi'
import type { AudienceRole, Evaluation, RiskLevel } from '../types/api'

const ALERT_STYLES: Record<RiskLevel, { label: string; eyebrow: string; panel: string; score: string; dot: string; message: string }> = {
  Low: {
    label: 'Normal monitoring',
    eyebrow: 'Water-use outlook',
    panel: 'from-emerald-950 via-emerald-900 to-teal-900',
    score: 'text-emerald-900',
    dot: 'bg-emerald-300',
    message: 'Current conditions do not indicate elevated water stress. Keep monitoring local conditions and use water thoughtfully.',
  },
  Medium: {
    label: 'Conserve and prepare',
    eyebrow: 'Water-use advisory',
    panel: 'from-amber-950 via-orange-900 to-amber-800',
    score: 'text-amber-900',
    dot: 'bg-amber-300',
    message: 'Water pressure is rising. Reduce non-essential use, review storage, and prepare for changing local conditions.',
  },
  High: {
    label: 'Act now to protect supply',
    eyebrow: 'Elevated water-stress warning',
    panel: 'from-rose-950 via-red-900 to-orange-900',
    score: 'text-rose-900',
    dot: 'bg-rose-300',
    message: 'Water stress is elevated. Prioritise essential needs, safeguard available storage, and follow local authority notices.',
  },
}

function AlertHero({ level, score, location, evaluatedAt, confidence }: { level: RiskLevel; score: number; location: string; evaluatedAt: string; confidence: number }) {
  const style = ALERT_STYLES[level]
  const scorePosition = Math.min(Math.max(score, 0), 100)

  return (
    <section className={`alert-hero relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br ${style.panel} px-6 py-7 text-white shadow-2xl shadow-slate-950/20 sm:px-8 sm:py-9`}>
      <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-1/3 h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />
      <div className="relative z-10 grid gap-7 lg:grid-cols-[minmax(0,1fr)_250px] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/90">
              <span className={`h-2 w-2 rounded-full ${style.dot} shadow-[0_0_12px_currentColor]`} />
              {style.eyebrow}
            </span>
            <span className="text-xs text-white/65">Updated {formatUtc(evaluatedAt)}</span>
          </div>
          <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{style.label}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">{style.message}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/75">
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-white/80" />{location}</span>
            <span>Assessment confidence {formatNumber(confidence * 100, 0)}%</span>
          </div>
        </div>
        <div className="risk-index-panel rounded-2xl border border-white/15 bg-slate-950/20 p-5 backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">Current risk index</p>
          <div className="mt-1 flex items-end gap-2">
            <span className={`font-mono text-6xl font-bold tracking-tighter ${style.score}`}>{formatNumber(score, 0)}</span>
            <span className="mb-2 font-mono text-sm text-stone-600">/ 100</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-300">
            <div className={`h-full rounded-full ${style.dot}`} style={{ width: `${scorePosition}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-medium uppercase tracking-wide text-stone-600"><span>Low</span><span>Moderate</span><span>High</span></div>
        </div>
      </div>
    </section>
  )
}

function AdvisoryEvidence({ evaluation }: { evaluation: Evaluation }) {
  const stress = topStressTriggers(evaluation.triggers)
  const quality = evaluation.quality

  return (
    <section className="glass-panel flex h-full flex-col rounded-2xl border border-slate-200/70 bg-white/85 p-6 shadow-xl shadow-slate-900/5 backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
        </div>
        <div><h2 className="font-semibold text-slate-900">Why this advisory is active</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">The strongest weather signals contributing to today’s water-use guidance.</p></div>
      </div>
      <div className="mt-5"><TriggerList triggers={stress} /></div>
      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-slate-400">Latest reading</dt><dd className="mt-1 font-medium text-slate-700">{formatUtc(quality?.latest_observed_at_utc)}</dd></div>
        <div><dt className="text-xs text-slate-400">24h coverage</dt><dd className="mt-1 font-semibold text-slate-800">{formatNumber((quality?.coverage_24h ?? 0) * 100, 0)}%</dd></div>
        <div><dt className="text-xs text-slate-400">Assessment rule set</dt><dd className="mt-1 font-mono text-xs font-medium text-slate-700">{evaluation.rules_version}</dd></div>
      </dl>
    </section>
  )
}

export function DashboardPage() {
  const loader = useCallback(() => getCurrentRisk(), [])
  const { data, error, loading, reload } = useApi(loader)
  const [role, setRole] = useState<AudienceRole>('residents')

  useEffect(() => {
    const intervalId = window.setInterval(reload, 30_000)
    return () => window.clearInterval(intervalId)
  }, [reload])

  if (loading && !data) return <LoadingBlock label="Loading water-use advisory…" />
  if (error) return <ErrorBlock title="Unable to retrieve the current advisory" detail={errorMessage(error)} onRetry={reload} />
  if (!data) return <EmptyBlock title="No water-risk evaluation available yet" />

  const features = data.features
  const burst = data.triggers.filter((trigger) => trigger.scope === 'burst')
  const location = `${data.site.locality}, ${data.site.county} County`

  return (
    <div className="dashboard-reveal space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">MajiGuard advisory centre</p>
          <p className="mt-1 text-sm text-slate-500">Live water-stress intelligence for communities, farms, and local managers.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Monitoring syncs every 30 seconds
        </div>
      </div>

      <AlertHero level={data.risk_level} score={data.risk_score} location={location} evaluatedAt={data.evaluated_at_utc} confidence={data.confidence} />

      {burst.map((trigger) => <StatusBanner key={trigger.id} tone="info" title={t(trigger.description_zh)} />)}

      <NationalRiskOverview
        evaluation={data}
        guidance={<AdvicePanel evaluation={data} role={role} onRoleChange={setRole} />}
        evidence={<AdvisoryEvidence evaluation={data} />}
      />

      <details className="group rounded-2xl border border-slate-200/70 bg-white/75 shadow-lg shadow-slate-900/5 backdrop-blur">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-sm font-semibold text-slate-800 marker:content-none">
          <span><span className="block">Supporting weather readings</span><span className="mt-1 block text-xs font-normal text-slate-500">Validated measurements used as evidence for the advisory, not a live sensor console.</span></span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Rainfall · 24 hours" value={`${formatNumber(features?.rainfall_24h_mm)} mm`} accent="sky" />
          <MetricCard label="Rainfall · 72 hours" value={`${formatNumber(features?.rainfall_72h_mm)} mm`} accent="sky" />
          <MetricCard label="Rainy days · 7 days" value={formatNumber(features?.rain_days_7d, 0)} accent="indigo" />
          <MetricCard label="Maximum temperature · 24h" value={`${formatNumber(features?.temp_max_24h_c)} °C`} accent="rose" />
          <MetricCard label="Minimum humidity · 24h" value={`${formatNumber(features?.humidity_min_24h_pct)}%`} accent="emerald" />
          <MetricCard label="Maximum wind gust · 24h" value={`${formatNumber(features?.wind_gust_max_24h_ms)} m/s`} accent="amber" />
        </div>
      </details>
    </div>
  )
}
