import type { AudienceRole, RiskLevel, TrendMetric, TrendPeriod, TriggerScope } from '../types/api'

export const LEVEL_ZH: Record<RiskLevel, string> = {
  Low: '低',
  Medium: '中',
  High: '高',
}

export const LEVEL_CLASSES: Record<RiskLevel, string> = {
  Low: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Medium: 'bg-amber-100 text-amber-900 border-amber-200',
  High: 'bg-rose-100 text-rose-800 border-rose-200',
}

export const ROLE_ZH: Record<AudienceRole, string> = {
  residents: '居民',
  farmers: '农户',
  managers: '管理者',
}

export const SCOPE_ZH: Record<TriggerScope, string> = {
  stress: '用水压力',
  burst: '降雨突增',
  quality: '数据质量',
}

export const METRIC_ZH: Record<TrendMetric, string> = {
  rainfall: '累计降雨 (mm)',
  temperature: '平均气温 (°C)',
  humidity: '平均相对湿度 (%)',
  wind_speed: '平均风速 (m/s)',
  wind_gust: '最大阵风 (m/s)',
  pressure: '平均气压 (hPa)',
  risk_score: '风险分数',
}

export const PERIODS: TrendPeriod[] = ['24h', '72h', '7d']

export const TREND_METRICS: TrendMetric[] = [
  'rainfall',
  'temperature',
  'humidity',
  'wind_speed',
  'wind_gust',
  'pressure',
  'risk_score',
]

export function formatUtc(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' UTC'
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

export function isStale(stalenessMinutes?: number, confidence?: number): boolean {
  return (stalenessMinutes ?? 0) > 120 || (confidence ?? 1) <= 0.3
}

export function topStressTriggers<T extends { scope: TriggerScope; weight: number }>(
  triggers: T[],
  limit = 3,
): T[] {
  return [...triggers]
    .filter((t) => t.scope === 'stress')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
}

export function errorMessage(error: Error): string {
  return error.message || '请求失败'
}
