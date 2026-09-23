type Accent = 'sky' | 'indigo' | 'rose' | 'emerald' | 'amber' | 'slate'

const ACCENT_BG: Record<Accent, string> = {
  sky: 'from-amber-500 to-yellow-600',
  indigo: 'from-stone-600 to-amber-700',
  rose: 'from-rose-700 to-orange-700',
  emerald: 'from-emerald-700 to-teal-700',
  amber: 'from-amber-600 to-orange-700',
  slate: 'from-stone-600 to-stone-800',
}

export function MetricCard({
  label,
  value,
  accent = 'slate',
}: {
  label: string
  value: string
  accent?: Accent
}) {
  return (
    <div className="inner-surface group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-lg shadow-slate-900/5 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-amber-900/15">
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${ACCENT_BG[accent]} opacity-10 blur-2xl transition-opacity group-hover:opacity-20`} />
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">{label}</p>
        <div className={`h-2 w-2 rounded-full bg-gradient-to-br ${ACCENT_BG[accent]} shadow-sm`} />
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">{value}</p>
    </div>
  )
}
