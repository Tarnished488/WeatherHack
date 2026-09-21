import { useCallback, useState } from 'react'
import { getCurrentRisk, postRefresh } from '../api/client'
import { AdvicePanel } from '../components/AdvicePanel'
import { MetricCard } from '../components/MetricCard'
import { RiskBadge } from '../components/RiskBadge'
import { EmptyBlock, ErrorBlock, LoadingBlock, StatusBanner } from '../components/StatusBanner'
import { TriggerList } from '../components/TriggerList'
import {
  errorMessage,
  formatNumber,
  formatUtc,
  isStale,
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
    if (!window.confirm('重新评估当前数据库中的观测？这是 Demo 操作，会写入新的评估结果。')) {
      return
    }
    setRefreshing(true)
    setRefreshNote(null)
    try {
      const result = await postRefresh()
      setRefreshNote(
        `评估完成：${result.evaluation.risk_level} / ${result.evaluation.risk_score}，规则 ${result.evaluation.rules_version}`,
      )
      reload()
    } catch (err) {
      setRefreshNote(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  if (loading && !data) return <LoadingBlock label="正在读取当前风险…" />
  if (error) {
    return (
      <ErrorBlock
        title="无法获取当前风险"
        detail={errorMessage(error)}
        onRetry={reload}
      />
    )
  }
  if (!data) return <EmptyBlock title="没有可用的风险评估" />

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
          <h1 className="text-xl font-semibold text-slate-900">风险总览</h1>
          <p className="text-sm text-slate-500">
            基于 Conduit 观测数据的可解释用水压力评估。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reload}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            刷新数据
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {refreshing ? '正在重新评估…' : 'Demo 重新评估'}
          </button>
        </div>
      </div>

      {refreshNote ? <StatusBanner tone="info" title={refreshNote} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <RiskBadge level={data.risk_level} score={data.risk_score} />
          <dl className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-400">最新观测</dt>
              <dd>{formatUtc(quality?.latest_observed_at_utc)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">评估时间</dt>
              <dd>{formatUtc(data.evaluated_at_utc)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">规则版本</dt>
              <dd className="font-mono">{data.rules_version}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">置信度</dt>
              <dd>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-slate-800"
                    style={{ width: `${Math.round(data.confidence * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-xs">{formatNumber(data.confidence, 2)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">24h 数据覆盖</dt>
              <dd>{formatNumber((quality?.coverage_24h ?? 0) * 100, 0)} %</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">24h 样本数</dt>
              <dd>{formatNumber(quality?.sample_count_24h, 0)}</dd>
            </div>
          </dl>
        </section>
        <AdvicePanel evaluation={data} role={role} onRoleChange={setRole} />
      </div>

      {stale ? (
        <StatusBanner tone="warning" title="数据可能过期，判断置信度已降低">
          最新观测滞后约 {formatNumber(quality?.staleness_minutes, 0)} 分钟。请把结果当作有限证据，而不是实时完整监测。
        </StatusBanner>
      ) : null}

      {qualityTriggers.map((trigger) => (
        <StatusBanner key={trigger.id} tone="warning" title={trigger.description_zh}>
          <span className="font-mono text-xs">{trigger.id}</span>
        </StatusBanner>
      ))}

      {burst.map((trigger) => (
        <StatusBanner key={trigger.id} tone="info" title="降雨突增准备提醒（不计入用水压力分数）">
          {trigger.description_zh}
        </StatusBanner>
      ))}

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">关键读数</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="24h 累计降雨"
            value={`${formatNumber(features?.rainfall_24h_mm)} mm`}
            hint="rainfall_24h_mm"
          />
          <MetricCard
            label="72h 累计降雨"
            value={`${formatNumber(features?.rainfall_72h_mm)} mm`}
            hint="rainfall_72h_mm"
          />
          <MetricCard
            label="7 天有雨天数"
            value={formatNumber(features?.rain_days_7d, 0)}
            hint="rain_days_7d"
          />
          <MetricCard
            label="24h 最高气温"
            value={`${formatNumber(features?.temp_max_24h_c)} °C`}
            hint="temp_max_24h_c"
          />
          <MetricCard
            label="24h 平均气温"
            value={`${formatNumber(features?.temp_avg_24h_c)} °C`}
            hint="temp_avg_24h_c"
          />
          <MetricCard
            label="24h 最低湿度"
            value={`${formatNumber(features?.humidity_min_24h_pct)} %`}
            hint="humidity_min_24h_pct"
          />
          <MetricCard
            label="24h 平均湿度"
            value={`${formatNumber(features?.humidity_avg_24h_pct)} %`}
            hint="humidity_avg_24h_pct"
          />
          <MetricCard
            label="24h 最大阵风"
            value={`${formatNumber(features?.wind_gust_max_24h_ms)} m/s`}
            hint="wind_gust_max_24h_ms"
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-slate-900">排名最高的风险原因</h2>
        <TriggerList triggers={stress} />
      </section>
    </div>
  )
}
