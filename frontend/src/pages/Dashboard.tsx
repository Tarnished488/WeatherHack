import { useCallback, useState } from 'react'
import { getCurrentRisk, postRefresh } from '../api/client'
import { AdvicePanel } from '../components/AdvicePanel'
import { MetricCard } from '../components/MetricCard'
import { RiskBadge } from '../components/RiskBadge'
import { EmptyBlock, ErrorBlock, LoadingBlock, StatusBanner } from '../components/StatusBanner'
import { TriggerList } from '../components/TriggerList'
import {
  describeField,
  errorMessage,
  formatNumber,
  formatUtc,
  isStale,
  t,
  topStressTriggers,
} from '../lib/format'
import { useApi } from '../lib/useApi'
import type { AudienceRole } from '../types/api'

export function DashboardPage() {
  const loader = useCallback(() => getCurrentRisk(), [])
  const { data, error, loading, reload } = useApi(loader)
  const [role, setRole] = useState<AudienceRole>('residents')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshNote, setRefreshNote] = useState<string | null>(null)

  async function onRefresh() {
    if (!window.confirm('Re-evaluate observations in the current database? This is a Demo-only action and will write a new evaluation.')) {
      return
    }
    setRefreshing(true)
    setRefreshNote(null)
    try {
      const result = await postRefresh()
      setRefreshNote(
        `Evaluation complete: ${result.evaluation.risk_level} / ${result.evaluation.risk_score}, rules ${result.evaluation.rules_version}`,
      )
      reload()
    } catch (err) {
      setRefreshNote(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  if (loading && !data) return <LoadingBlock label="Loading current risk assessment…" />
  if (error) {
    return (
      <ErrorBlock
        title="Unable to retrieve current risk"
        detail={errorMessage(error)}
        onRetry={reload}
      />
    )
  }
  if (!data) return <EmptyBlock title="No risk evaluation available yet" />

  const quality = data.quality
  const features = data.features
  const stale = isStale(quality?.staleness_minutes, data.confidence)
  const stress = topStressTriggers(data.triggers)
  const burst = data.triggers.filter((t) => t.scope === 'burst')
  const qualityTriggers = data.triggers.filter((t) => t.scope === 'quality')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Risk Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Interpretable water-stress assessment based on Conduit observations.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur transition-all hover:bg-white hover:shadow"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
              <path d="M21 3v5h-5"/>
            </svg>
            Refresh
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-sky-500/25 transition-all hover:shadow-lg hover:shadow-sky-500/30 disabled:opacity-50"
          >
            {refreshing ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.2-8.5"/>
                </svg>
                Evaluating…
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                </svg>
                Demo Re-evaluate
              </>
            )}
          </button>
        </div>
      </div>

      {refreshNote ? <StatusBanner tone="info" title={refreshNote} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-5 rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
          <RiskBadge level={data.risk_level} score={data.risk_score} />
          <div className="grid gap-4 rounded-xl bg-slate-50/60 p-4 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Latest observation</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{formatUtc(quality?.latest_observed_at_utc)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Evaluated at</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{formatUtc(data.evaluated_at_utc)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Rules version</dt>
              <dd className="mt-0.5 font-mono text-xs text-slate-700">{data.rules_version}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Confidence</dt>
              <dd className="mt-1">
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-600 transition-all duration-700"
                    style={{ width: `${Math.round(data.confidence * 100)}%` }}
                  />
                </div>
                <span className="mt-1 inline-block font-mono text-xs font-semibold text-slate-700">{formatNumber(data.confidence, 2)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">24h coverage</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{formatNumber((quality?.coverage_24h ?? 0) * 100, 0)} %</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">24h samples</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{formatNumber(quality?.sample_count_24h, 0)}</dd>
            </div>
          </div>
        </section>
        <AdvicePanel evaluation={data} role={role} onRoleChange={setRole} />
      </div>

      {stale ? (
        <StatusBanner tone="warning" title="Data may be stale — confidence has been reduced">
          Latest observation lags by ~{formatNumber(quality?.staleness_minutes, 0)} minutes. Treat results as limited evidence, not real-time complete monitoring.
        </StatusBanner>
      ) : null}

      {qualityTriggers.map((trigger) => (
        <StatusBanner key={trigger.id} tone="warning" title={t(trigger.description_zh)}>
          <span className="font-mono text-xs">{trigger.id}</span>
        </StatusBanner>
      ))}

      {burst.map((trigger) => (
        <StatusBanner key={trigger.id} tone="info" title={t(trigger.description_zh)} />
      ))}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Key Readings</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Rolling aggregations — each card's sub-line is the exact validation / usage note from the Conduit field dictionary.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/60 px-2.5 py-1 text-[10px] font-mono text-slate-500 backdrop-blur">
            Sensors: rg1 rg2 · temp_sht · humidity_sht · wind_spd · wind_gust · heat_idx
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="1-hour Rainfall"
            value={`${formatNumber(features?.rainfall_1h_mm)} mm`}
            hint={describeField('rainfall_1h_mm')}
            accent="sky"
          />
          <MetricCard
            label="24-hour Rainfall"
            value={`${formatNumber(features?.rainfall_24h_mm)} mm`}
            hint={describeField('rainfall_24h_mm')}
            accent="sky"
          />
          <MetricCard
            label="72-hour Rainfall"
            value={`${formatNumber(features?.rainfall_72h_mm)} mm`}
            hint={describeField('rainfall_72h_mm')}
            accent="sky"
          />
          <MetricCard
            label="Rainy days · 7d"
            value={formatNumber(features?.rain_days_7d, 0)}
            hint={describeField('rain_days_7d')}
            accent="indigo"
          />
          <MetricCard
            label="24h Max Temperature"
            value={`${formatNumber(features?.temp_max_24h_c)} °C`}
            hint={describeField('temp_max_24h_c')}
            accent="rose"
          />
          <MetricCard
            label="24h Avg Temperature"
            value={`${formatNumber(features?.temp_avg_24h_c)} °C`}
            hint={describeField('temp_avg_24h_c')}
            accent="rose"
          />
          <MetricCard
            label="24h Min Humidity"
            value={`${formatNumber(features?.humidity_min_24h_pct)} %`}
            hint={describeField('humidity_min_24h_pct')}
            accent="emerald"
          />
          <MetricCard
            label="24h Avg Humidity"
            value={`${formatNumber(features?.humidity_avg_24h_pct)} %`}
            hint={describeField('humidity_avg_24h_pct')}
            accent="emerald"
          />
          <MetricCard
            label="24h Max Wind Speed"
            value={`${formatNumber(features?.wind_spd_max_24h_ms)} m/s`}
            hint={describeField('wind_spd_max_24h_ms')}
            accent="amber"
          />
          <MetricCard
            label="24h Max Wind Gust"
            value={`${formatNumber(features?.wind_gust_max_24h_ms)} m/s`}
            hint={describeField('wind_gust_max_24h_ms')}
            accent="amber"
          />
          <MetricCard
            label="24h Max Heat Index"
            value={`${formatNumber(features?.heat_idx_max_24h_c)} °C`}
            hint={describeField('heat_idx_max_24h_c')}
            accent="rose"
          />
          <MetricCard
            label="Data Samples · 24h"
            value={formatNumber(quality?.sample_count_24h, 0)}
            hint={`${describeField('sample_count_24h')} Coverage ${formatNumber((quality?.coverage_24h ?? 0) * 100, 0)} %.`}
            accent="slate"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Top Risk Drivers</h2>
        </div>
        <TriggerList triggers={stress} />
      </section>
    </div>
  )
}
