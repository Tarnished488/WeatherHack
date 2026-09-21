import type { RiskLevel } from '../types/api'
import { LEVEL_CLASSES, LEVEL_ZH } from '../lib/format'

export function RiskBadge({ level, score }: { level: RiskLevel; score: number }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <span
        className={`inline-flex items-center rounded-full border px-4 py-1.5 text-lg font-semibold ${LEVEL_CLASSES[level]}`}
      >
        风险 {LEVEL_ZH[level]}
      </span>
      <p className="text-sm text-slate-600">
        分数 <span className="font-mono text-2xl font-semibold text-slate-900">{score}</span>
        <span className="text-slate-400"> / 100</span>
      </p>
    </div>
  )
}
