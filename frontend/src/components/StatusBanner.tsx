import type { ReactNode } from 'react'

type Tone = 'warning' | 'error' | 'info'

const TONE: Record<Tone, { banner: string; icon: string; title: string }> = {
  warning: {
    banner: 'border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/50 text-amber-950 shadow-sm shadow-amber-900/5',
    icon: 'text-amber-600 bg-amber-100',
    title: 'border-l-amber-400',
  },
  error: {
    banner: 'border-rose-200 bg-gradient-to-r from-rose-50 to-pink-50/50 text-rose-950 shadow-sm shadow-rose-900/5',
    icon: 'text-rose-600 bg-rose-100',
    title: 'border-l-rose-400',
  },
  info: {
    banner: 'border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50/40 text-sky-950 shadow-sm shadow-sky-900/5',
    icon: 'text-sky-600 bg-sky-100',
    title: 'border-l-sky-400',
  },
}

const TONE_ICON: Record<Tone, ReactNode> = {
  warning: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <path d="M12 9v4"/><path d="M12 17h.01"/>
    </svg>
  ),
  error: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="10"/>
      <path d="m15 9-6 6"/><path d="m9 9 6 6"/>
    </svg>
  ),
  info: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 16v-4"/><path d="M12 8h.01"/>
    </svg>
  ),
}

export function StatusBanner({
  tone,
  title,
  children,
}: {
  tone: Tone
  title: string
  children?: ReactNode
}) {
  return (
    <div className={`flex gap-3 rounded-2xl border border-l-4 px-4 py-3.5 ${TONE[tone].banner} ${TONE[tone].title}`}>
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONE[tone].icon}`}>
        {TONE_ICON[tone]}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        {children ? <div className="mt-1 text-sm leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  )
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="space-y-4">
      <div className="h-8 w-56 rounded-xl bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="h-60 rounded-2xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
        <div className="h-60 rounded-2xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-24 rounded-2xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
        <div className="h-24 rounded-2xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
        <div className="h-24 rounded-2xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
        <div className="h-24 rounded-2xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 animate-spin text-slate-400">
          <path d="M21 12a9 9 0 1 1-6.2-8.5"/>
        </svg>
        <span className="font-medium">{label}</span>
      </div>
    </div>
  )
}

export function ErrorBlock({
  title,
  detail,
  onRetry,
}: {
  title: string
  detail: string
  onRetry?: () => void
}) {
  return (
    <StatusBanner tone="error" title={title}>
      <p className="font-mono text-xs opacity-80">{detail}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-sm font-semibold text-rose-800 ring-1 ring-rose-200 transition-all hover:bg-rose-50 hover:ring-rose-300"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>
          </svg>
          Retry
        </button>
      ) : null}
    </StatusBanner>
  )
}

export function EmptyBlock({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200/60 bg-white/70 p-10 text-center shadow-sm backdrop-blur">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 15s1.5 2 4 2 4-2 4-2"/>
          <path d="M9 9h.01"/><path d="M15 9h.01"/>
        </svg>
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-800">{title}</h3>
      {children ? <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">{children}</p> : null}
    </div>
  )
}
