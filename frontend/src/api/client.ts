import type {
  AlertsResponse,
  Evaluation,
  RefreshResponse,
  TransparencyResponse,
  TrendMetric,
  TrendPeriod,
  TrendsResponse,
} from '../types/api'

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    let detail = response.statusText || `HTTP ${response.status}`
    try {
      const body: unknown = await response.json()
      if (body && typeof body === 'object' && 'detail' in body) {
        const raw = (body as { detail: unknown }).detail
        detail = typeof raw === 'string' ? raw : JSON.stringify(raw)
      }
    } catch {
      /* keep statusText */
    }
    throw new ApiError(response.status, detail)
  }
  return response.json() as Promise<T>
}

export function getCurrentRisk(): Promise<Evaluation> {
  return request<Evaluation>('/api/current-risk')
}

export function getTrends(
  metric: TrendMetric,
  period: TrendPeriod,
  at?: string,
): Promise<TrendsResponse> {
  const params = new URLSearchParams({ metric, period })
  if (at) params.set('at', at)
  return request<TrendsResponse>(`/api/trends?${params.toString()}`)
}

export function getAlerts(limit = 50): Promise<AlertsResponse> {
  return request<AlertsResponse>(`/api/alerts?limit=${limit}`)
}

export function getTransparency(): Promise<TransparencyResponse> {
  return request<TransparencyResponse>('/api/data-transparency')
}

export function postRefresh(source?: string): Promise<RefreshResponse> {
  const params = source ? `?source=${encodeURIComponent(source)}` : ''
  return request<RefreshResponse>(`/api/refresh${params}`, { method: 'POST' })
}
