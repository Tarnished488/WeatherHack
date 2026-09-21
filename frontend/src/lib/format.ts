import type { AudienceRole, RiskLevel, TrendMetric, TrendPeriod, TriggerScope } from '../types/api'

export const LEVEL_LABEL: Record<RiskLevel, string> = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
}

export const LEVEL_CLASSES: Record<RiskLevel, string> = {
  Low: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Medium: 'bg-amber-100 text-amber-900 border-amber-200',
  High: 'bg-rose-100 text-rose-800 border-rose-200',
}

export const ROLE_LABEL: Record<AudienceRole, string> = {
  residents: 'Residents',
  farmers: 'Farmers',
  managers: 'Managers',
}

export const SCOPE_LABEL: Record<TriggerScope, string> = {
  stress: 'Water stress',
  burst: 'Rain burst',
  quality: 'Data quality',
}

export const METRIC_LABEL: Record<TrendMetric, string> = {
  rainfall: 'Rainfall (mm)',
  temperature: 'Avg Temperature (°C)',
  humidity: 'Avg Humidity (%)',
  wind_speed: 'Avg Wind Speed (m/s)',
  wind_gust: 'Max Wind Gust (m/s)',
  pressure: 'Avg Pressure (hPa)',
  risk_score: 'Risk Score',
}

export const PERIODS: TrendPeriod[] = ['day', 'week', 'month', 'three_months']

export const PERIOD_LABEL: Record<TrendPeriod, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  three_months: '3 months',
}

export const TREND_METRICS: TrendMetric[] = [
  'rainfall',
  'temperature',
  'humidity',
  'wind_speed',
  'wind_gust',
  'pressure',
  'risk_score',
]

export const FIELD_NAME_MAP: Record<string, string> = {
  // Source API fields to clean SQLite columns / data dictionary names
  ts: 'observed_at_utc (Observation Time)',
  rg1: 'rg1 (Rain Gauge 1)',
  rg2: 'rg2 (Rain Gauge 2)',
  rg1tt: 'rg1tt (Rain Gauge 1 Total Today)',
  rg2tt: 'rg2tt (Rain Gauge 2 Total Today)',
  rg1tp: 'rg1tp (Rain Gauge 1 Total Prior)',
  rg2tp: 'rg2tp (Rain Gauge 2 Total Prior)',
  temp_sht: 'temp_sht (SHT Temp °C)',
  temp_bmx: 'temp_bmx (BMX Temp °C)',
  temp_mcp: 'temp_mcp (MCP Temp °C)',
  humidity_sht: 'humidity_sht (SHT Humidity %)',
  wind_spd: 'wind_spd (Wind Speed m/s)',
  wind_dir: 'wind_dir (Wind Direction °)',
  wind_gust: 'wind_gust (Wind Gust m/s)',
  wind_gust_dir: 'wind_gust_dir (Wind Gust Dir °)',
  press_bmx: 'press_bmx (BMX Pressure hPa)',
  heat_idx: 'heat_idx (Heat Index)',
  wet_bulb_temp: 'wet_bulb_temp (Wet-Bulb Temp °C)',
  wet_bulb_globe_temp: 'wet_bulb_globe_temp (WBGT °C)',
  si1145_vis: 'si1145_vis (Visible Light)',
  si1145_ir: 'si1145_ir (Infrared Light)',
  si1145_uv: 'si1145_uv (UV Light)',

  // Derived feature fields
  rainfall_1h_mm: '1h Rainfall (mm)',
  rainfall_24h_mm: '24h Rainfall (mm)',
  rainfall_72h_mm: '72h Rainfall (mm)',
  rain_days_7d: '7d Rainy Days',
  temp_max_24h_c: '24h Max Temp (°C)',
  temp_avg_24h_c: '24h Avg Temp (°C)',
  humidity_min_24h_pct: '24h Min Humidity (%)',
  humidity_avg_24h_pct: '24h Avg Humidity (%)',
  wind_spd_max_24h_ms: '24h Max Wind Speed (m/s)',
  wind_gust_max_24h_ms: '24h Max Wind Gust (m/s)',
  heat_idx_max_24h_c: '24h Max Heat Index (°C)',
  coverage_24h: '24h Data Coverage',
  completeness_24h: '24h Data Completeness',
  staleness_minutes: 'Staleness (min)',
  invalid_ratio_24h: '24h Invalid Data Ratio',
  sample_count_24h: '24h Sample Count',
}

export function formatFieldLabel(key: string): string {
  return FIELD_NAME_MAP[key] ?? key
}

export const FIELD_NOTES: Record<string, string> = {
  rainfall_1h_mm:
    'Sum of rg1 + rg2 over the past 1 hour. Rain-gauge readings must not be negative; NULL if any window is empty.',
  rainfall_24h_mm:
    'Sum of rg1 + rg2 over the past 24 hours. Primary input for short-term water stress and rain-burst logic.',
  rainfall_72h_mm:
    'Sum of rg1 + rg2 over the past 72 hours. Used as the baseline dry-season / persistent-drought indicator.',
  rain_days_7d:
    'Number of 24h windows in the last 7 days with any non-zero rg1/rg2 reading. Flags rolling below-baseline conditions.',
  temp_max_24h_c:
    'MAX(temp_sht) over 24h. Cross-checkable against temp_bmx and temp_mcp; unit °C, drives heat-stress guidance.',
  temp_avg_24h_c:
    'AVG(temp_sht) over 24h. SHT sensor is the nominated primary ambient-temperature input.',
  humidity_min_24h_pct:
    'MIN(humidity_sht) over 24h. Expected range 0–100 %; values outside this range trigger the quality flag humidity_out_of_range.',
  humidity_avg_24h_pct:
    'AVG(humidity_sht) over 24h. Combined with temperature for evaporative-demand and heat-index context.',
  wind_spd_max_24h_ms:
    'MAX(wind_spd) over 24h. Wind-speed readings must never be negative; combined with heat for evaporation exposure.',
  wind_gust_max_24h_ms:
    'MAX(wind_gust) over 24h. Normally ≥ wind_spd; a discrepancy is logged as a soft quality warning.',
  heat_idx_max_24h_c:
    'MAX(heat_idx) over 24h. Heat index resembles a °C scale but its unit is not yet source-confirmed — treat as a derived stress metric.',
  observed_at_utc: 'Observation timestamp in UTC (Clean column for source API field "ts"). Required and unique.',
  rg1: 'Rain gauge 1 reading in mm. Must not be negative.',
  rg2: 'Rain gauge 2 reading in mm. Must not be negative.',
  rg1tt: 'Rain gauge 1 "Total Today" reading. Preserve as-is until daily-reset behavior is validated.',
  rg2tt: 'Rain gauge 2 "Total Today" reading. Preserve as-is until daily-reset behavior is validated.',
  rg1tp: 'Rain gauge 1 "Total Prior" reading. Source header does not define prior period.',
  rg2tp: 'Rain gauge 2 "Total Prior" reading. Source header does not define prior period.',
  temp_sht: 'Temperature from the SHT temperature/humidity sensor (°C). Primary ambient-temperature input.',
  temp_bmx: 'BMX temperature sensor reading (°C). Can be cross-checked against temp_sht and temp_mcp.',
  temp_mcp: 'MCP temperature sensor reading (°C). Can be cross-checked against temp_bmx and temp_sht.',
  humidity_sht: 'Relative humidity from the SHT sensor (%). Expected range 0–100 %.',
  wind_spd: 'Wind speed in m/s. Must not be negative.',
  wind_dir: 'Wind-direction angle in degrees (0–360).',
  wind_gust: 'Wind-gust speed in m/s. Must not be negative; typically ≥ wind_spd.',
  wind_gust_dir: 'Wind-gust direction angle in degrees (0–360).',
  press_bmx: 'BMX atmospheric-pressure sensor in hPa. Station elevation affects absolute pressure.',
  heat_idx: 'Heat index — perceived heat stress from T + RH. Unit not yet source-confirmed.',
  wet_bulb_temp: 'Wet-bulb temperature in °C. Useful for heat-stress analysis.',
  wet_bulb_globe_temp:
    'WBGT (Wet-Bulb Globe Temperature) in °C. Important heat-stress input for high-heat and outdoor-activity guidance.',
  si1145_vis:
    'SI1145 visible-light channel — raw value, NOT lux. Use only for relative change detection.',
  si1145_ir:
    'SI1145 infrared channel — raw value, NOT irradiance. Use only for relative change detection.',
  si1145_uv:
    'SI1145 ultraviolet channel — raw value, NOT a standard UV Index before calibration.',
  coverage_24h:
    'Fraction of expected 24h samples actually observed. Low coverage reduces evaluation confidence.',
  completeness_24h:
    'Fraction of 24h samples flagged numeric and in-range. Completeness < coverage means data-quality flags fired.',
  staleness_minutes:
    'Age of the latest observation vs evaluation time. > 120 min reduces confidence to 0.3 max.',
  invalid_ratio_24h:
    'Ratio of non-numeric / out-of-range observations in the last 24h rolling window.',
  sample_count_24h: 'Actual observations retained in the last 24h, after invalid-flag removal.',
}

export function describeField(key: string): string {
  return FIELD_NOTES[key] ?? key
}

const ZH_TO_EN: Record<string, string> = {
  '过去 72 小时累计降雨偏低（持续干燥条件）':
    'Past 72-hour cumulative rainfall is low (persistent dry conditions)',
  '近 7 天有雨天数偏少（滚动降雨低于近期本地基线）':
    'Rainy days in the last 7 days are below normal (rolling rain below recent local baseline)',
  '高温叠加低湿度，蒸发条件强':
    'High temperature combined with low humidity — strong evaporative demand',
  '过去 24 小时出现高温':
    'High temperatures observed in the past 24 hours',
  '强阵风叠加较高气温，蒸发暴露进一步增加':
    'Strong gusts combined with high temperature further increase evaporative exposure',
  '过去 1 小时降雨突增（独立的储水/排水准备提醒，不计入用水压力分数）':
    'Rainfall spike in the past 1 hour (standalone storage/drainage notice, not counted in water-stress score)',

  // Quality Triggers
  '过去 24 小时存在较多被标记为无效的观测数据':
    'Elevated ratio of invalid observation data in the past 24 hours',
  '过去 24 小时观测覆盖率不足，可能存在数据缺口':
    'Low observation coverage in the past 24 hours — potential data gap',

  // Recommendations
  '评估非必要用水，考虑安全储水':
    'Reassess non-essential water use and consider safe water storage',
  '复核灌溉安排与土壤实际墒情，优先遵循当地农业指导':
    'Review irrigation schedules against real soil-moisture conditions; follow local agricultural guidance first',
  '关注持续干燥趋势，考虑发布社区节水提醒':
    'Monitor the persistent drying trend; consider issuing community water-saving notices',
  '关注储水水位，避免用水浪费':
    'Monitor water-storage levels and avoid unnecessary water waste',
  '评估近期灌溉需求，避开中午高温时段浇水':
    'Evaluate near-term irrigation needs; water outside the midday heat window',
  '检查社区水源与储水设施状态':
    'Inspect the status of community water sources and storage facilities',
  '减少高温时段的户外用水，改在清晨或傍晚浇灌':
    'Reduce outdoor water use during hot hours; switch to early-morning or late-afternoon watering',
  '优先在清晨/傍晚灌溉，覆盖土壤以减少蒸发':
    'Prioritize early-morning / late-afternoon irrigation; cover soil to cut evaporation',
  '提醒社区高温时段合理安排用水':
    'Remind the community to schedule water use sensibly during hot periods',
  '高温时段减少非必要用水':
    'Reduce non-essential water use during hot hours',
  '关注作物与牲畜的饮水需求':
    'Watch drinking-water demand for crops and livestock',
  '关注供水设施在高温期的负荷':
    'Monitor the load on water-supply infrastructure during hot periods',
  '检查露天储水容器是否加盖，减少蒸发与灰尘污染':
    'Cover open water-storage containers to reduce evaporation and dust contamination',
  '大风高温时段避免喷灌，减少蒸发损耗':
    'Avoid sprinkler irrigation during windy hot periods to reduce evaporative loss',
  '关注储水设施在大风天气下的损耗':
    'Monitor losses at water-storage facilities during windy weather',
  '检查屋顶集水与储水容器，做好接水准备':
    'Inspect roof catchment and storage containers; be ready to capture rainwater',
  '检查田间排水，防止短时积水':
    'Inspect field drainage to prevent short-term waterlogging',
  '检查排水通道与储水设施，提醒社区防短时强降雨':
    'Inspect drains and storage; alert the community against short heavy-rain events',
  '当前用水压力风险较低，维持日常用水习惯即可':
    'Current water-stress risk is low; maintain normal daily water use',
  '可按常规安排灌溉，留意后续天气变化':
    'Schedule irrigation as usual and monitor upcoming weather changes',
  '暂无需额外行动，保持监测':
    'No additional action required for now; keep monitoring',
  '建议开始节约用水并确认储水充足':
    'Start saving water and confirm your water storage is sufficient',
  '建议优化灌溉时间，优先保障关键作物':
    'Optimize irrigation timing; prioritize water for high-value crops',
  '建议向社区发布节水提示，检查储水设施':
    'Issue community water-saving tips and inspect storage facilities',
  '建议立即节水并做好储水准备，关注当地管理部门通知':
    'Start saving water immediately and prepare storage; follow official local notices',
  '建议暂缓非关键灌溉，优先保障饮水与关键作物':
    'Postpone non-critical irrigation; prioritize drinking water and high-value crops',
  '建议发布社区告警，优先检查供水与储水设施':
    'Issue a community alert; prioritize checks on water supply and storage facilities',

  // Transparency / Field Docs
  '雨量计 1 逐分钟降雨': 'Rain gauge 1 minute reading',
  '雨量计 2 逐分钟降雨': 'Rain gauge 2 minute reading',
  '气温（SHT 传感器）': 'Temperature (SHT sensor)',
  '相对湿度（SHT 传感器）': 'Relative humidity (SHT sensor)',
  '平均风速': 'Average wind speed',
  '阵风风速': 'Wind gust speed',
  '大气压（BMP 传感器）': 'Atmospheric pressure (BMX sensor)',
  '大气压（BMX 传感器）': 'Atmospheric pressure (BMX sensor)',
  '体感高温指数': 'Heat index',
  '湿球温度': 'Wet-bulb temperature',
  '湿球黑球温度': 'WBGT (Wet-Bulb Globe Temperature)',
  '可见光 / 红外 / 紫外读数': 'Visible / Infrared / UV light readings',

  // Data Source & Policy
  'Conduit@Empathy1 环境站（3D FEWS NET / UCAR ICDP）':
    'Conduit@Empathy1 Weather Station (3D FEWS NET / UCAR ICDP)',
  '1 分钟': '1 minute',
  '趋势接口按小时（24h/72h）或按天（7d）聚合':
    'Trends aggregated hourly (24h/72h) or daily (7d)',
  '越界或关键字段缺失 → is_valid=0 并写入 quality_flags_json，不删除数据':
    'Out-of-range or missing critical fields → is_valid=0 and recorded in quality_flags_json without deleting data',

  // Known Limitations
  '阈值基于单一站点（JKUAT, Kiambu）2026-08 ~ 2026-09 约 3 周数据调优，尚未跨季节验证。':
    'Thresholds tuned on ~3 weeks of single-station data (JKUAT, Kiambu; Aug–Sep 2026); not yet seasonally validated.',
  '不输出医疗、公共卫生或饮用水安全结论。':
    'Does not output medical, public health, or potable water safety conclusions.',
  '不输出精确灌溉水量或作物专属建议。':
    'Does not output precise irrigation volume or crop-specific recommendations.',
  '不提供权威洪水预测；降雨突增仅为储水/排水准备提醒。':
    'Does not provide authoritative flood forecasting; rainfall spikes trigger storage/drainage preparation warnings only.',
  '不假设数据中存在水质或水量字段。':
    'Does not assume water quality or volume fields are present in data.',
  '系统仅提供决策支持，不直接控制水泵、灌溉设备或公共基础设施。':
    'System provides decision support only; does not directly control pumps, irrigation, or public infrastructure.',
}

export function t(text: string): string {
  if (!text) return text
  if (text.startsWith('最新观测已滞后约')) {
    const mins = text.replace(/[^0-9]/g, '')
    return `Latest observation lags by ~${mins} minutes — data may be stale`
  }
  return ZH_TO_EN[text] ?? text
}

export function formatUtc(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' UTC'
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US', {
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
  return error.message || 'Request failed'
}
