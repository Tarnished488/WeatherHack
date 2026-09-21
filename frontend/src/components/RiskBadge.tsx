import type { RiskLevel } from '../types/api'
import { LEVEL_CLASSES, LEVEL_LABEL } from '../lib/format'

export function RiskBadge({ level, score }: { level: RiskLevel; score: number }) {
  return (
    <div className="flex flex-wrap items-end gap-5">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-2xl border px-5 py-2 text-xl font-bold shadow-sm ${LEVEL_CLASSES[level]}`}
        >
          <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${level === 'High' ? 'bg-rose-600' : level === 'Medium' ? 'bg-amber-600' : 'bg-emerald-600'}`} />
          {LEVEL_LABEL[level]}
        </span>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Risk score</p>
        <p className="text-sm text-slate-500">
          <span className="font-mono text-4xl font-bold tracking-tight text-slate-900">{score}</span>
          <span className="ml-1 font-mono text-lg text-slate-400">/ 100</span>
        </p>
      </div>
    </div>
  )
}
