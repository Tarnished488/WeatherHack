import type { ReactNode } from 'react'

type Tone = 'warning' | 'error' | 'info'

const TONE: Record<Tone, string> = {
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  error: 'border-rose-200 bg-rose-50 text-rose-950',
  info: 'border-sky-200 bg-sky-50 text-sky-950',
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
    <div className={`rounded-xl border px-4 py-3 ${TONE[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm">{children}</div> : null}
    </div>
  )
}

export function LoadingBlock({ label = '正在加载…' }: { label?: string }) {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-8 w-48 rounded bg-slate-200" />
      <div className="h-24 rounded-xl bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-20 rounded-xl bg-slate-200" />
        <div className="h-20 rounded-xl bg-slate-200" />
        <div className="h-20 rounded-xl bg-slate-200" />
      </div>
      <p className="text-sm text-slate-500">{label}</p>
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
      <p className="font-mono text-xs">{detail}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md bg-white px-3 py-1 text-sm text-rose-800 ring-1 ring-rose-200"
        >
          重试
        </button>
      ) : null}
    </StatusBanner>
  )
}

export function EmptyBlock({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <StatusBanner tone="info" title={title}>
      {children}
    </StatusBanner>
  )
}
