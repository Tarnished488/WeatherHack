import type { AudienceRole, Evaluation } from '../types/api'
import { ROLE_ZH } from '../lib/format'

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
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">行动建议</h2>
        <div className="flex rounded-lg border border-slate-200 p-0.5">
          {ROLES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onRoleChange(item)}
              className={`rounded-md px-3 py-1 text-sm ${
                item === role
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {ROLE_ZH[item]}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        决策支持，不是强制指令。请结合当地条件与管理部门通知判断。
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-800">
        {items.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </section>
  )
}
