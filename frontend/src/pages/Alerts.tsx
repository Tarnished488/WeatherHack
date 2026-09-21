import { useCallback, useMemo, useState } from 'react'
import { getAlerts } from '../api/client'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/StatusBanner'
import { TriggerList } from '../components/TriggerList'
import {
  errorMessage,
  formatNumber,
  formatUtc,
  LEVEL_CLASSES,
  LEVEL_ZH,
  ROLE_ZH,
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
  const advice =
    role === 'all'
      ? ROLES.flatMap((item) => (alert.recommendations[item] ?? []).map((text) => `${ROLE_ZH[item]}：${text}`))
      : alert.recommendations[role] ?? []

  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full border px-3 py-1 text-sm font-medium ${LEVEL_CLASSES[alert.risk_level]}`}>
          {LEVEL_ZH[alert.risk_level]} · {alert.risk_score}
        </span>
        <p className="text-xs text-slate-500">窗口结束 {formatUtc(alert.window_end_utc)}</p>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span>评估 {formatUtc(alert.evaluated_at_utc)}</span>
        <span>规则 {alert.rules_version}</span>
        <span>置信度 {formatNumber(alert.confidence, 2)}</span>
        <span>触发 {alert.triggers.length} 条规则</span>
      </div>
      <TriggerList triggers={alert.triggers} />
      <div>
        <h3 className="text-sm font-medium text-slate-800">建议</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
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

  if (loading && !data) return <LoadingBlock label="正在读取告警历史…" />
  if (error) {
    return <ErrorBlock title="无法获取告警历史" detail={errorMessage(error)} onRetry={reload} />
  }
  if (!data || data.count === 0) {
    return (
      <EmptyBlock title="还没有评估记录">
        告警接口返回的是评估历史。请先运行后端 pipeline，或在数据透明度页触发 Demo 刷新。
      </EmptyBlock>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">告警历史</h1>
          <p className="text-sm text-slate-500">共 {data.count} 次评估，每张卡片可追溯触发规则与观测证据。</p>
        </div>
        <button
          type="button"
          onClick={reload}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          刷新
        </button>
      </div>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={`rounded-xl border p-4 shadow-sm ${LEVEL_CLASSES.High}`}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">高风险次数</p>
            <p className="mt-1 font-mono text-2xl">{formatNumber(stats.High, 0)}</p>
          </div>
          <div className={`rounded-xl border p-4 shadow-sm ${LEVEL_CLASSES.Medium}`}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">中风险次数</p>
            <p className="mt-1 font-mono text-2xl">{formatNumber(stats.Medium, 0)}</p>
          </div>
          <div className={`rounded-xl border p-4 shadow-sm ${LEVEL_CLASSES.Low}`}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">低风险次数</p>
            <p className="mt-1 font-mono text-2xl">{formatNumber(stats.Low, 0)}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">风险等级：</label>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {LEVELS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLevel(item)}
                className={`rounded-md px-3 py-1 text-sm ${
                  level === item ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item === 'all' ? '全部' : LEVEL_ZH[item]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">建议角色：</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AudienceRole | 'all')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">全部角色建议</option>
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {ROLE_ZH[item]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          当前筛选条件下没有记录。
        </p>
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
