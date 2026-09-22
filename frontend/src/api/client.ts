import type {
  AlertsResponse,
  Evaluation,
  LlmAdviceResponse,
  RefreshResponse,
  RiskDistributionResponse,
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

// Empty in local development: Vite proxies /api to FastAPI. Set
// VITE_API_BASE_URL for a separately hosted frontend, e.g. http://127.0.0.1:8000.
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init)
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

export function getLlmAdvice(force = false): Promise<LlmAdviceResponse> {
  const query = force ? '?force=true' : ''
  return request<LlmAdviceResponse>(`/api/llm-advice${query}`)
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

export function getRiskDistribution(period: TrendPeriod): Promise<RiskDistributionResponse> {
  const params = new URLSearchParams({ period })
  return request<RiskDistributionResponse>(`/api/risk-distribution?${params.toString()}`)
}

export function getAlerts(limit = 50): Promise<AlertsResponse> {
  return request<AlertsResponse>(`/api/alerts?limit=${limit}`)
}

export function getTransparency(): Promise<TransparencyResponse> {
  return request<TransparencyResponse>('/api/data-transparency')
}

export function postRefresh(fromdate: string, todate: string): Promise<RefreshResponse> {
  const params = new URLSearchParams({ fromdate, todate })
  return request<RefreshResponse>(`/api/refresh?${params.toString()}`, { method: 'POST' })
}

export function postRefreshWindow(window: TrendPeriod): Promise<RefreshResponse> {
  return request<RefreshResponse>(`/api/refresh?${new URLSearchParams({ window }).toString()}`, { method: 'POST' })
}
