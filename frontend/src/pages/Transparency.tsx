import { useCallback, useState } from 'react'
import { getTransparency, postRefresh } from '../api/client'
import { ErrorBlock, LoadingBlock, StatusBanner } from '../components/StatusBanner'
import { errorMessage, formatNumber } from '../lib/format'
import { useApi } from '../lib/useApi'

export function TransparencyPage() {
  const loader = useCallback(() => getTransparency(), [])
  const { data, error, loading, reload } = useApi(loader)
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

  if (loading && !data) return <LoadingBlock label="正在读取数据透明度…" />
  if (error) {
    return <ErrorBlock title="无法获取透明度信息" detail={errorMessage(error)} onRetry={reload} />
  }
  if (!data) return null

  const source = data.data_source

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">数据透明度</h1>
          <p className="text-sm text-slate-500">供评委核验实际使用的 Conduit 字段、清洗策略与规则版本。</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {refreshing ? '正在刷新…' : 'Demo 重新评估'}
        </button>
      </div>

      {refreshNote ? <StatusBanner tone="info" title={refreshNote} /> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">数据来源</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-400">名称</dt>
            <dd>{source.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">站点</dt>
            <dd>{source.site}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">DOI</dt>
            <dd>
              <a className="text-sky-800 underline" href={source.doi} target="_blank" rel="noreferrer">
                {source.doi}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">采样 / 聚合</dt>
            <dd>
              {source.sampling_interval} · {source.aggregation}
            </dd>
          </div>
        </dl>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">字段</th>
              <th className="px-4 py-2">单位</th>
              <th className="px-4 py-2">说明</th>
            </tr>
          </thead>
          <tbody>
            {data.fields_used.map((field) => (
              <tr key={field.column} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono">{field.column}</td>
                <td className="px-4 py-2">{field.unit}</td>
                <td className="px-4 py-2">{field.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">校验策略</h2>
        <p className="mt-2 text-sm text-slate-700">{data.validation.policy}</p>
        <ul className="mt-3 grid gap-1 font-mono text-xs text-slate-600 sm:grid-cols-2">
          {Object.entries(data.validation.ranges).map(([key, range]) => (
            <li key={key}>
              {key}: {formatNumber(range[0], 2)} – {formatNumber(range[1], 2)}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          风险规则 <span className="font-mono text-sm font-normal text-slate-500">{data.risk_rules.version}</span>
        </h2>
        <div className="mt-3 space-y-3">
          {data.risk_rules.rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">
                {rule.id} · {rule.scope} · 权重 {rule.weight}
              </p>
              <p className="mt-1 text-slate-700">{rule.description_zh}</p>
              <ul className="mt-2 font-mono text-xs text-slate-600">
                {rule.conditions.map((cond) => (
                  <li key={`${cond.feature}-${cond.op}`}>
                    {cond.feature} {cond.op} {Array.isArray(cond.value) ? cond.value.join(', ') : cond.value}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">已知局限</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          {data.known_limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
