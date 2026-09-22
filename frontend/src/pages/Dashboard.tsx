import { useCallback, useEffect, useState } from 'react'
import { getCurrentRisk, postRefresh } from '../api/client'
import { AdvicePanel } from '../components/AdvicePanel'
import { MetricCard } from '../components/MetricCard'
import { NationalRiskOverview } from '../components/NationalRiskOverview'
import { RiskBadge } from '../components/RiskBadge'
import { EmptyBlock, ErrorBlock, LoadingBlock, StatusBanner } from '../components/StatusBanner'
import { TriggerList } from '../components/TriggerList'
import {
  errorMessage,
  formatNumber,
  formatUtc,
  t,
  topStressTriggers,
} from '../lib/format'
import { useApi } from '../lib/useApi'
import type { AudienceRole } from '../types/api'

export function DashboardPage() {
  const loader = useCallback(() => getCurrentRisk(), [])
  const { data, error, loading, reload } = useApi(loader)
  const [role, setRole] = useState<AudienceRole>('residents')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [distributionRefreshKey, setDistributionRefreshKey] = useState(0)
  const [refreshMessage, setRefreshMessage] = useState<{ tone: 'info' | 'error'; title: string } | null>(null)

  // The backend owns data ingestion and risk calculation. The UI polls only
  // the read endpoint, so a page visit never exposes Conduit credentials or
  // triggers duplicate ingestion.  AI advice is bring-your-own-key and lives
  // entirely inside <AdvicePanel />; the dashboard stays out of it.
  useEffect(() => {
    const intervalId = window.setInterval(reload, 30_000)
    return () => window.clearInterval(intervalId)
  }, [reload])

  async function onFetchLatestData() {
    if (!fromDate || !toDate) {
      setRefreshMessage({ tone: 'error', title: 'Choose both a start date and an end date before fetching.' })
      return
    }
    setRefreshing(true)
    setRefreshMessage(null)
    try {
      const result = await postRefresh(fromDate, toDate)
      const ingest = result.ingest
      setRefreshMessage({
        tone: 'info',
        title: `Source refresh completed: ${ingest?.rows_read ?? 0} received, ${ingest?.rows_inserted ?? 0} new observations stored, ${result.daily_evaluations ?? 0} daily risk results calculated.`,
      })
      reload()
      setDistributionRefreshKey((key) => key + 1)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setRefreshMessage({ tone: 'error', title: `Source refresh failed: ${detail}` })
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
  const stress = topStressTriggers(data.triggers)
  const burst = data.triggers.filter((t) => t.scope === 'burst')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Backend sync · every 30s
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Kenya Water Risk Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Interpretable water-stress assessment based on Conduit observations.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white/80 p-2 shadow-sm backdrop-blur">
          <label className="text-xs font-medium text-slate-600">
            From
            <div className="relative mt-1">
              <input
                type="date"
                lang="en-GB"
                aria-label="Start date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(event) => setFromDate(event.target.value)}
                className={`block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/30 ${fromDate ? '' : 'date-input-empty'}`}
              />
              {!fromDate ? (
                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-slate-500">
                  YYYY-MM-DD
                </span>
              ) : null}
            </div>
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <div className="relative mt-1">
              <input
                type="date"
                lang="en-GB"
                aria-label="End date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => setToDate(event.target.value)}
                className={`block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/30 ${toDate ? '' : 'date-input-empty'}`}
              />
              {!toDate ? (
                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-slate-500">
                  YYYY-MM-DD
                </span>
              ) : null}
            </div>
          </label>
          <button
            type="button"
            onClick={onFetchLatestData}
            disabled={refreshing || !fromDate || !toDate}
            className="mb-0.5 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md shadow-sky-500/25 transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? 'Fetching…' : 'Fetch source data'}
          </button>
        </div>
      </div>

      {refreshMessage ? <StatusBanner tone={refreshMessage.tone} title={refreshMessage.title} /> : null}

      <NationalRiskOverview evaluation={data} refreshKey={distributionRefreshKey} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
            <RiskBadge level={data.risk_level} score={data.risk_score} />
            <div className="mt-5">
              <div className="relative h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500">
                <div
                  className="absolute inset-y-0 w-1 rounded-full bg-slate-900 shadow"
                  style={{ left: `calc(${Math.min(Math.max(data.risk_score, 0), 100)}% - 2px)` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-wide text-slate-400">
                <span>Low 0</span>
                <span>Medium 33</span>
                <span>High 67</span>
                <span>100</span>
              </div>
            </div>
            <div className="mt-5 grid gap-4 rounded-xl bg-slate-50/60 p-4 text-sm text-slate-600 sm:grid-cols-2">
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

          <section className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Top Risk Drivers</h2>
                <p className="text-[11px] text-slate-400">Weighted rules behind the current score</p>
              </div>
            </div>
            <TriggerList triggers={stress} />
          </section>
        </div>
        <AdvicePanel evaluation={data} role={role} onRoleChange={setRole} />
      </div>

      {burst.map((trigger) => (
        <StatusBanner key={trigger.id} tone="info" title={t(trigger.description_zh)} />
      ))}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Key Readings</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Validated rolling observations from the active Conduit station.
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
            accent="sky"
          />
          <MetricCard
            label="24-hour Rainfall"
            value={`${formatNumber(features?.rainfall_24h_mm)} mm`}
            accent="sky"
          />
          <MetricCard
            label="72-hour Rainfall"
            value={`${formatNumber(features?.rainfall_72h_mm)} mm`}
            accent="sky"
          />
          <MetricCard
            label="Rainy days · 7d"
            value={formatNumber(features?.rain_days_7d, 0)}
            accent="indigo"
          />
          <MetricCard
            label="24h Max Temperature"
            value={`${formatNumber(features?.temp_max_24h_c)} °C`}
            accent="rose"
          />
          <MetricCard
            label="24h Avg Temperature"
            value={`${formatNumber(features?.temp_avg_24h_c)} °C`}
            accent="rose"
          />
          <MetricCard
            label="24h Min Humidity"
            value={`${formatNumber(features?.humidity_min_24h_pct)} %`}
            accent="emerald"
          />
          <MetricCard
            label="24h Avg Humidity"
            value={`${formatNumber(features?.humidity_avg_24h_pct)} %`}
            accent="emerald"
          />
          <MetricCard
            label="24h Max Wind Speed"
            value={`${formatNumber(features?.wind_spd_max_24h_ms)} m/s`}
            accent="amber"
          />
          <MetricCard
            label="24h Max Wind Gust"
            value={`${formatNumber(features?.wind_gust_max_24h_ms)} m/s`}
            accent="amber"
          />
          <MetricCard
            label="24h Max Heat Index"
            value={`${formatNumber(features?.heat_idx_max_24h_c)} °C`}
            accent="rose"
          />
          <MetricCard
            label="Data Samples · 24h"
            value={formatNumber(quality?.sample_count_24h, 0)}
            accent="slate"
          />
        </div>
      </section>
    </div>
  )
}
