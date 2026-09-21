import { useCallback, useState } from 'react'
import { getTransparency, postRefresh } from '../api/client'
import { ErrorBlock, LoadingBlock, StatusBanner } from '../components/StatusBanner'
import { describeField, errorMessage, formatFieldLabel, formatNumber, LEVEL_LABEL, t } from '../lib/format'
import { useApi } from '../lib/useApi'

export function TransparencyPage() {
  const loader = useCallback(() => getTransparency(), [])
  const { data, error, loading, reload } = useApi(loader)
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
        `Evaluation complete: ${LEVEL_LABEL[result.evaluation.risk_level]} / Score ${result.evaluation.risk_score}, rules ${result.evaluation.rules_version}`,
      )
      reload()
    } catch (err) {
      setRefreshNote(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  if (loading && !data) return <LoadingBlock label="Loading data transparency…" />
  if (error) {
    return <ErrorBlock title="Unable to retrieve transparency info" detail={errorMessage(error)} onRetry={reload} />
  }
  if (!data) return null

  const source = data.data_source

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Data Transparency</h1>
          <p className="mt-1 text-sm text-slate-500">
            For judges to verify the Conduit fields actually used, the cleaning policy, and the rule version.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur transition-all hover:bg-white hover:shadow"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>
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
                Refreshing…
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>
                </svg>
                Demo Re-evaluate
              </>
            )}
          </button>
        </div>
      </div>

      {refreshNote ? <StatusBanner tone="info" title={refreshNote} /> : null}

      <section className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Data Source</h2>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Name</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">{t(source.name)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Site</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">{source.site}</dd>
          </div>
          <div className="rounded-xl bg-slate-50/80 p-3 sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">DOI / Citation</dt>
            <dd className="mt-0.5">
              <a className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900" href={source.doi} target="_blank" rel="noreferrer">
                {source.doi}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                </svg>
              </a>
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Sampling interval</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">{t(source.sampling_interval)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50/80 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Aggregation</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">{t(source.aggregation)}</dd>
          </div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M3 3v18h18"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-7"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Fields Used</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50/90 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Column</th>
                <th className="px-5 py-3 font-semibold">Unit</th>
                <th className="px-5 py-3 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.fields_used.map((field, idx) => (
                <tr key={field.column} className={idx % 2 ? 'bg-white/40' : ''}>
                  <td className="px-5 py-3 font-mono text-xs text-slate-800">{formatFieldLabel(field.column)}</td>
                  <td className="px-5 py-3 text-slate-700">{field.unit}</td>
                  <td className="px-5 py-3 text-slate-700">
                    <div className="text-sm leading-relaxed">{t(field.description)}</div>
                    {describeField(field.column) !== field.column ? (
                      <div className="mt-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">Validation / usage:</span>{' '}
                        {describeField(field.column)}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Validation Policy</h2>
        </div>
        <p className="rounded-xl bg-slate-50/80 p-4 text-sm leading-relaxed text-slate-700">{t(data.validation.policy)}</p>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Expected value ranges</p>
          <ul className="mt-2 grid gap-2 font-mono text-xs sm:grid-cols-2">
            {Object.entries(data.validation.ranges).map(([key, range]) => (
              <li key={key} className="rounded-lg border border-slate-100 bg-white/60 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">{formatFieldLabel(key)}</span>
                  <span className="text-slate-500">
                    {formatNumber(range[0], 2)} <span className="text-slate-300">→</span> {formatNumber(range[1], 2)}
                  </span>
                </div>
                {describeField(key) !== key ? (
                  <div className="mt-1.5 font-sans text-[11px] leading-relaxed text-slate-500">
                    <span className="font-medium text-slate-600">Validation / usage:</span>{' '}
                    {describeField(key)}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Risk Rules</h2>
          </div>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-600">v {data.risk_rules.version}</span>
        </div>
        <div className="space-y-3">
          {data.risk_rules.rules.map((rule) => (
            <div key={rule.id} className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4 transition-all hover:border-slate-200 hover:shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {rule.id}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {rule.scope} · weight {rule.weight}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">{t(rule.description_zh)}</p>
              <ul className="mt-3 space-y-1.5 rounded-lg bg-white/70 p-3 font-mono text-xs text-slate-600 ring-1 ring-slate-100">
                {rule.conditions.map((cond) => (
                  <li key={`${cond.feature}-${cond.op}`} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-1 w-1 rounded-full bg-slate-400" />
                      <span className="font-semibold text-slate-700">{formatFieldLabel(cond.feature)}</span>
                      <span className="text-slate-400">{cond.op}</span>
                      <span className="text-slate-500">{Array.isArray(cond.value) ? cond.value.join(', ') : cond.value}</span>
                    </div>
                    {describeField(cond.feature) !== cond.feature ? (
                      <div className="pl-3 font-sans text-[11px] leading-relaxed text-slate-500">
                        <span className="font-medium text-slate-600">Validation / usage:</span>{' '}
                        {describeField(cond.feature)}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/80 to-rose-50/30 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Known Limitations</h2>
        </div>
        <ul className="space-y-2 pl-1">
          {data.known_limitations.map((item, idx) => (
            <li key={item} className="flex gap-3 rounded-xl bg-white/60 p-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{idx + 1}</span>
              <span className="text-sm leading-relaxed text-slate-700">{t(item)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
