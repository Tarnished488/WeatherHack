import type { Trigger } from '../types/api'
import { formatNumber, SCOPE_ZH } from '../lib/format'

export function TriggerList({ triggers }: { triggers: Trigger[] }) {
  if (triggers.length === 0) {
    return <p className="text-sm text-slate-500">当前没有触发的压力规则。</p>
  }

  return (
    <ol className="space-y-3">
      {triggers.map((trigger, index) => (
        <li key={trigger.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-400">#{index + 1}</span>
            <span className="rounded bg-white px-2 py-0.5 text-xs text-slate-600">
              {SCOPE_ZH[trigger.scope]} · {trigger.id}
            </span>
            {trigger.weight > 0 ? (
              <span className="text-xs text-slate-500">权重 {trigger.weight}</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-800">{trigger.description_zh}</p>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600 sm:grid-cols-2">
            {Object.entries(trigger.observed).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2 font-mono">
                <dt>{key}</dt>
                <dd>{typeof value === 'number' ? formatNumber(value, 2) : String(value ?? '—')}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  )
}
