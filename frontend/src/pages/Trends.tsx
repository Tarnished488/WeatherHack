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
  METRIC_ZH,
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
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'UTC' })
  }
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">趋势</h1>
          <p className="text-sm text-slate-500">24h/72h 按小时聚合，7d 按天聚合。来自观测表或已持久化的评估。</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as TrendMetric)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {TREND_METRICS.map((item) => (
              <option key={item} value={item}>
                {METRIC_ZH[item]}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {PERIODS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  period === item ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={reload}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            刷新
          </button>
        </div>
      </div>

      {loading && !data ? <LoadingBlock label="正在读取趋势…" /> : null}
      {error ? (
        <ErrorBlock title="趋势请求失败" detail={errorMessage(error)} onRetry={reload} />
      ) : null}

      {data && metric === 'risk_score' ? (
        <StatusBanner tone="info" title="风险分数是离散评估时点">
          图上只显示已写入 risk_evaluations 的结果。若只运行过一次评估，7 天窗口里可能只有一个点，这不是连续预测曲线。
        </StatusBanner>
      ) : null}

      {data && !error && points.length === 0 ? (
        <EmptyBlock title="这个周期没有可绘制的点">
          {metric === 'risk_score'
            ? '请先在后端运行评估，或在数据透明度页刷新 Demo 数据。'
            : '当前窗口内没有有效观测。'}
        </EmptyBlock>
      ) : null}

      {stats && points.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">数据点</p>
            <p className="mt-1 font-mono text-2xl text-slate-900">{formatNumber(stats.count, 0)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">最小值</p>
            <p className="mt-1 font-mono text-2xl text-slate-900">{formatNumber(stats.min, 1)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">最大值</p>
            <p className="mt-1 font-mono text-2xl text-slate-900">{formatNumber(stats.max, 1)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">平均值</p>
            <p className="mt-1 font-mono text-2xl text-slate-900">{formatNumber(stats.avg, 1)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">时间跨度</p>
            <p className="mt-1 text-xs text-slate-900">
              {formatXAxis(stats.start, bucket)} ~ {formatXAxis(stats.end, bucket)}
            </p>
          </div>
        </div>
      ) : null}

      {data && points.length > 0 ? (
        <div className="h-80 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={METRIC_COLORS[metric]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={METRIC_COLORS[metric]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 11 }}
                minTickGap={24}
                tickFormatter={(t) => formatXAxis(t, bucket)}
                stroke="#94a3b8"
              />
              <YAxis tick={{ fontSize: 11 }} width={48} stroke="#94a3b8" />
              <Tooltip
                labelFormatter={(t) => formatUtc(String(t))}
                formatter={(value) => [
                  formatNumber(typeof value === 'number' ? value : null, 2),
                  METRIC_ZH[metric],
                ]}
                contentStyle={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={METRIC_ZH[metric]}
                stroke={METRIC_COLORS[metric]}
                dot={metric === 'risk_score' || points.length < 8}
                strokeWidth={2.5}
                activeDot={{ r: 5, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  )
}
