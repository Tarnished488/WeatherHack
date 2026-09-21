import type { AudienceRole, Evaluation } from '../types/api'
import { ROLE_LABEL, t } from '../lib/format'

const ROLES: AudienceRole[] = ['residents', 'farmers', 'managers']

export function AdvicePanel({
  evaluation,
  role,
  onRoleChange,
}: {
  evaluation: Evaluation
  role: AudienceRole
  onRoleChange: (role: AudienceRole) => void
}) {
  const items = evaluation.recommendations[role] ?? []

  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Action Guidance</h2>
            <p className="text-xs text-slate-500">Decision support — not mandatory instructions</p>
          </div>
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white/80 p-0.5 shadow-sm backdrop-blur">
          {ROLES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onRoleChange(item)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
                item === role
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {ROLE_LABEL[item]}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 rounded-xl bg-sky-50/70 p-3 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-100">
        Guidance for decision-making, not mandatory instructions. Always combine with local conditions and official management notices.
      </p>
      <ul className="mt-5 space-y-3">
        {items.map((text, idx) => (
          <li key={idx} className="flex gap-3 rounded-xl bg-slate-50/70 p-3.5 ring-1 ring-slate-100 transition-all hover:bg-slate-50">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-[11px] font-bold text-white shadow-sm">
              {idx + 1}
            </span>
            <span className="text-sm leading-relaxed text-slate-800">{t(text)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
