export type RiskLevel = 'Low' | 'Medium' | 'High'
export type TriggerScope = 'stress' | 'burst' | 'quality'
export type AudienceRole = 'residents' | 'farmers' | 'managers'

export type TrendMetric =
  | 'rainfall'
  | 'temperature'
  | 'humidity'
  | 'wind_speed'
  | 'wind_gust'
  | 'pressure'
  | 'risk_score'

export type TrendPeriod = '24h' | '72h' | '7d'
export type TrendBucket = 'hour' | 'day'

export interface Trigger {
  id: string
  scope: TriggerScope
  weight: number
  description_zh: string
  observed: Record<string, number | string | null>
  recommendations?: Partial<Record<AudienceRole, string>>
}

export interface RiskFeatures {
  rainfall_1h_mm: number | null
  rainfall_24h_mm: number | null
  rainfall_72h_mm: number | null
  rain_days_7d: number | null
  temp_max_24h_c: number | null
  temp_avg_24h_c: number | null
  humidity_min_24h_pct: number | null
  humidity_avg_24h_pct: number | null
  wind_spd_max_24h_ms: number | null
  wind_gust_max_24h_ms: number | null
  heat_idx_max_24h_c: number | null
}

export interface DataQuality {
  window_end_utc: string
  evaluated_at_utc: string
  latest_observed_at_utc: string | null
  staleness_minutes: number
  coverage_24h: number
  completeness_24h: number
  invalid_ratio_24h: number
  sample_count_24h: number
}

export interface Evaluation {
  window_end_utc: string
  evaluated_at_utc: string
  rules_version: string
  risk_score: number
  risk_level: RiskLevel
  confidence: number
  triggers: Trigger[]
  recommendations: Record<AudienceRole, string[]>
  features: RiskFeatures | null
  quality: DataQuality | null
}

export interface TrendPoint {
  t: string
  value: number | null
}

export interface TrendsResponse {
  metric: TrendMetric
  period: TrendPeriod
  bucket: TrendBucket
  points: TrendPoint[]
}

export interface AlertsResponse {
  count: number
  alerts: Evaluation[]
}

export interface FieldDoc {
  column: string
  unit: string
  description: string
}

export interface RiskRuleDoc {
  id: string
  scope: string
  weight: number
  conditions: Array<{
    feature: string
    op: string
    value: number | number[]
  }>
  description_zh: string
}

export interface TransparencyResponse {
  data_source: {
    name: string
    site: string
    doi: string
    sampling_interval: string
    aggregation: string
  }
  fields_used: FieldDoc[]
  validation: {
    policy: string
    ranges: Record<string, [number, number]>
  }
  risk_rules: {
    version: string
    rules: RiskRuleDoc[]
  }
  known_limitations: string[]
}

export interface RefreshResponse {
  ingest: {
    rows_read?: number
    rows_inserted?: number
    rows_flagged?: number
    rows_skipped?: number
  } | null
  evaluation: Evaluation
}
