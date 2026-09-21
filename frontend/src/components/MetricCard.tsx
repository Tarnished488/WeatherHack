type Accent = 'sky' | 'indigo' | 'rose' | 'emerald' | 'amber' | 'slate'

const ACCENT_BG: Record<Accent, string> = {
  sky: 'from-sky-500 to-cyan-500',
  indigo: 'from-indigo-500 to-violet-500',
  rose: 'from-rose-500 to-pink-500',
  emerald: 'from-emerald-500 to-teal-500',
  amber: 'from-amber-500 to-orange-500',
  slate: 'from-slate-500 to-slate-700',
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
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-lg shadow-slate-900/5 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/10">
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${ACCENT_BG[accent]} opacity-10 blur-2xl transition-opacity group-hover:opacity-20`} />
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <div className={`h-2 w-2 rounded-full bg-gradient-to-br ${ACCENT_BG[accent]} shadow-sm`} />
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
    </div>
  )
}
