import { useCallback, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getTrends } from '../api/client'
import { EmptyBlock, ErrorBlock, LoadingBlock, StatusBanner } from '../components/StatusBanner'
import {
  errorMessage,
  formatNumber,
  formatUtc,
  METRIC_LABEL,
  PERIODS,
  TREND_METRICS,
} from '../lib/format'
import { useApi } from '../lib/useApi'
import type { TrendMetric, TrendPeriod } from '../types/api'

const METRIC_COLORS: Record<TrendMetric, string> = {
  rainfall: '#0ea5e9',
  temperature: '#ef4444',
  humidity: '#6366f1',
  wind_speed: '#10b981',
  wind_gust: '#f59e0b',
  pressure: '#8b5cf6',
  risk_score: '#0f172a',
}

function formatXAxis(t: string, bucket: 'hour' | 'day') {
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return t
  if (bucket === 'day') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  }
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
}

export function TrendsPage() {
  const [metric, setMetric] = useState<TrendMetric>('rainfall')
  const [period, setPeriod] = useState<TrendPeriod>('7d')
  const loader = useCallback(() => getTrends(metric, period), [metric, period])
  const { data, error, loading, reload } = useApi(loader)

  const points = (data?.points ?? []).filter((p) => p.value != null)
  const bucket = data?.bucket ?? (period === '7d' ? 'day' : 'hour')

  const stats = useMemo(() => {
    if (points.length === 0) return null
    const values = points.map((p) => p.value as number)
    return {
      count: points.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      start: points[0].t,
      end: points[points.length - 1].t,
    }
  }, [points])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Trends</h1>
          <p className="mt-1 text-sm text-slate-500">24h/72h aggregated hourly, 7d aggregated daily. Pulled from observations or persisted evaluations.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as TrendMetric)}
            className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm backdrop-blur shadow-sm transition-all hover:shadow focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          >
            {TREND_METRICS.map((item) => (
              <option key={item} value={item}>
                {METRIC_LABEL[item]}
              </option>
            ))}
          </select>
          <div className="flex rounded-xl border border-slate-200 bg-white/80 p-0.5 backdrop-blur shadow-sm">
            {PERIODS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
                  period === item
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
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
        </div>
      </div>

      {loading && !data ? <LoadingBlock label="Loading trends…" /> : null}
      {error ? (
        <ErrorBlock title="Trends request failed" detail={errorMessage(error)} onRetry={reload} />
      ) : null}

      {data && metric === 'risk_score' ? (
        <StatusBanner tone="info" title="Risk scores are discrete evaluation points">
          The chart only shows results already written to risk_evaluations. If only one evaluation has run, the 7-day window may contain a single point — this is not a continuous forecast curve.
        </StatusBanner>
      ) : null}

      {data && !error && points.length === 0 ? (
        <EmptyBlock title="No drawable points for this period">
          {metric === 'risk_score'
            ? 'Run the evaluation pipeline first, or trigger a Demo refresh on the Transparency page.'
            : 'No valid observations in this window.'}
        </EmptyBlock>
      ) : null}

      {stats && points.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Points</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900">{formatNumber(stats.count, 0)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Minimum</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900">{formatNumber(stats.min, 1)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Maximum</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900">{formatNumber(stats.max, 1)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Average</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900">{formatNumber(stats.avg, 1)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Window</p>
            <p className="mt-1 text-xs font-medium text-slate-800">
              {formatXAxis(stats.start, bucket)} <span className="text-slate-400">—</span> {formatXAxis(stats.end, bucket)}
            </p>
          </div>
        </div>
      ) : null}

      {data && points.length > 0 ? (
        <div className="h-80 rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-lg shadow-slate-900/5 backdrop-blur">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={METRIC_COLORS[metric]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={METRIC_COLORS[metric]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 11, fill: '#64748b' }}
                minTickGap={24}
                tickFormatter={(t) => formatXAxis(t, bucket)}
                stroke="#cbd5e1"
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={48} stroke="#cbd5e1" axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <Tooltip
                labelFormatter={(t) => formatUtc(String(t))}
                formatter={(value) => [
                  formatNumber(typeof value === 'number' ? value : null, 2),
                  METRIC_LABEL[metric],
                ]}
                contentStyle={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(8px)',
                  padding: '10px 12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={METRIC_LABEL[metric]}
                stroke={METRIC_COLORS[metric]}
                dot={metric === 'risk_score' || points.length < 8 ? { r: 3, strokeWidth: 2, fill: '#fff' } : false}
                strokeWidth={2.5}
                activeDot={{ r: 6, strokeWidth: 2, fill: '#fff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  )
}
