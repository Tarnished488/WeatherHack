import type { Trigger } from '../types/api'
import { formatFieldLabel, formatNumber, SCOPE_LABEL, t } from '../lib/format'

export function TriggerList({ triggers }: { triggers: Trigger[] }) {
  const visibleTriggers = triggers.filter((trigger) => trigger.scope !== 'quality')

  if (visibleTriggers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 p-4 text-center text-sm text-slate-500">
        No stress rules triggered at this time.
      </div>
    )
  }

  return (
    <ol className="space-y-3">
      {visibleTriggers.map((trigger, index) => (
        <li key={trigger.id} className="group rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50/80 to-white p-4 transition-all hover:border-slate-200 hover:shadow-md hover:shadow-slate-900/5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white shadow-sm">
              {index + 1}
            </span>
            <span className="rounded-lg bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
              {SCOPE_LABEL[trigger.scope]} · {trigger.id}
            </span>
            {trigger.weight > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/5 px-2 py-0.5 text-xs font-medium text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                Weight {trigger.weight}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800">{t(trigger.description_zh)}</p>
          <dl className="mt-3 grid grid-cols-1 gap-1.5 rounded-lg bg-white/70 p-3 text-xs text-slate-600 ring-1 ring-slate-100 sm:grid-cols-2">
            {Object.entries(trigger.observed).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-2 font-mono">
                <dt className="text-slate-500" title={key}>{formatFieldLabel(key)}</dt>
                <dd className="font-semibold text-slate-700">{typeof value === 'number' ? formatNumber(value, 2) : String(value ?? '—')}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  )
}
