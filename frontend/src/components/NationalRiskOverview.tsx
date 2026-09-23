import { useCallback, useEffect, type ReactNode } from 'react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getRiskDistribution } from '../api/client'
import { useApi } from '../lib/useApi'
import type { Evaluation, RiskLevel } from '../types/api'

const RISK_COLORS: Record<RiskLevel, string> = {
  High: '#ef4444',
  Medium: '#f97316',
  Low: '#22c55e',
}

// Simplified from the public-domain Natural Earth Kenya boundary.
const KENYA_BOUNDARY: Array<[number, number]> = [
  [35.706, 4.619], [36.844, 4.432], [37.977, 3.726], [39.316, 3.495],
  [40.167, 4.035], [40.764, 4.285], [41.163, 3.943], [41.885, 3.977],
  [41.343, 3.201], [40.965, 2.814], [40.98, -0.871], [41.535, -1.696],
  [41.283, -1.969], [41.006, -1.902], [40.945, -2.309], [40.651, -2.539],
  [40.232, -2.669], [40.163, -2.934], [39.989, -3.373], [39.786, -3.917],
  [39.699, -4.048], [39.54, -4.43], [39.396, -4.629], [39.191, -4.678],
  [37.771, -3.655], [37.585, -3.413], [37.645, -3.046], [34.015, -1.038],
  [33.895, -0.663], [33.954, -0.154], [33.894, 0.11], [34.252, 0.655],
  [34.487, 1.082], [34.798, 1.232], [34.973, 1.654], [34.968, 2.102],
  [34.866, 2.348], [34.876, 2.591], [34.685, 2.881], [34.534, 3.118],
  [34.381, 3.477], [34.44, 3.668], [34.149, 3.823], [34.061, 4.008],
  [33.977, 4.22], [34.381, 4.62], [35.246, 4.982], [35.412, 5.03],
  [35.396, 4.926], [35.571, 4.904], [35.522, 4.78], [35.611, 4.62],
]

const DEFAULT_SITE = {
  id: 'jkuat-iot-aws-61',
  name: 'JKUAT IOT AWS',
  locality: 'Juja',
  county: 'Kiambu',
  country: 'Kenya',
  latitude: -1.099736,
  longitude: 37.014528,
}

const MAP_BOUNDS = { minLon: 33.7, maxLon: 42.0, minLat: -4.9, maxLat: 5.2 }

function project(longitude: number, latitude: number): [number, number] {
  const x = 30 + ((longitude - MAP_BOUNDS.minLon) / (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon)) * 360
  const y = 20 + ((MAP_BOUNDS.maxLat - latitude) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 430
  return [x, y]
}

function KenyaRiskMap({ evaluation }: { evaluation: Evaluation }) {
  const site = evaluation.site ?? DEFAULT_SITE
  const [siteX, siteY] = project(site.longitude, site.latitude)
  const [nairobiX, nairobiY] = project(36.8219, -1.2921)
  const outline = `${KENYA_BOUNDARY.map(([lon, lat], index) => {
    const [x, y] = project(lon, lat)
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')} Z`
  const riskColor = RISK_COLORS[evaluation.risk_level]

  return (
    <div className="relative min-h-[430px] overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-[#fffaf0] to-stone-100/80">
      <svg viewBox="0 0 420 480" className="h-[430px] w-full" role="img" aria-label={`Kenya risk map showing ${site.name} in ${site.county} County at ${evaluation.risk_level} risk`}>
        <defs>
          <filter id="station-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="kenya-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8edd7" />
            <stop offset="100%" stopColor="#e9d1a2" />
          </linearGradient>
        </defs>
        <path d={outline} fill="url(#kenya-fill)" stroke="#64748b" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx={nairobiX} cy={nairobiY} r="3" fill="#475569" />
        <text x={nairobiX + 8} y={nairobiY + 5} fill="#64748b" fontSize="11">Nairobi</text>
        <circle cx={siteX} cy={siteY} r="18" fill={riskColor} opacity="0.22" filter="url(#station-glow)" />
        <circle cx={siteX} cy={siteY} r="9" fill={riskColor} stroke="white" strokeWidth="3" />
        <line x1={siteX + 8} y1={siteY - 7} x2={siteX + 44} y2={siteY - 30} stroke={riskColor} strokeWidth="1.5" />
        <rect x={siteX + 40} y={siteY - 55} width="142" height="48" rx="9" fill="white" stroke="#e2e8f0" />
        <text x={siteX + 50} y={siteY - 36} fill="#0f172a" fontSize="12" fontWeight="600">{site.name}</text>
        <text x={siteX + 50} y={siteY - 20} fill={riskColor} fontSize="11">{site.county} · {evaluation.risk_level} {evaluation.risk_score}</text>
      </svg>
      <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-2 text-[11px] text-slate-500 shadow-sm backdrop-blur">
        Boundary: Natural Earth · Active station: {site.locality}, {site.county}
      </div>
    </div>
  )
}

export function NationalRiskOverview({
  evaluation,
  guidance,
  evidence,
}: {
  evaluation: Evaluation
  guidance: ReactNode
  evidence: ReactNode
}) {
  const distributionLoader = useCallback(() => getRiskDistribution('week'), [])
  const { data: distributionData, error: distributionError, loading: distributionLoading, reload: reloadDistribution } = useApi(distributionLoader)
  useEffect(() => {
    const intervalId = window.setInterval(reloadDistribution, 30_000)
    return () => window.clearInterval(intervalId)
  }, [reloadDistribution])

  const distribution = distributionData?.levels ?? (['High', 'Medium', 'Low'] as RiskLevel[]).map((level) => ({
    level,
    count: 0,
    probability: 0,
  }))
  const dailyScores = distributionData?.daily ?? []

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">National monitoring</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Kenya Water Risk Map</h2>
        <p className="mt-1 text-sm text-slate-500">Risk colours represent connected monitoring stations. Current coverage contains one verified Conduit station at JKUAT, Kiambu County.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-6 lg:items-start">
        <div className="glass-panel map-atmosphere rounded-2xl border border-slate-200/60 bg-white/80 p-3 shadow-lg shadow-slate-900/5 backdrop-blur lg:col-span-3">
          <KenyaRiskMap evaluation={evaluation} />
          <div className="flex flex-wrap gap-4 px-2 pb-2 pt-3 text-xs font-medium text-slate-600">
            {(['High', 'Medium', 'Low'] as RiskLevel[]).map((level) => (
              <span key={level} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RISK_COLORS[level] }} />
                {level} risk
              </span>
            ))}
          </div>
        </div>

        {guidance}

        <section className="glass-panel h-full rounded-2xl border border-slate-200/60 bg-white/70 p-5 shadow-lg shadow-slate-900/5 backdrop-blur lg:col-span-4 lg:col-start-1 lg:self-stretch">
          <div>
            <h3 className="font-semibold text-slate-900">Risk pattern</h3>
            <p className="mt-1 text-xs text-slate-500">Weekly distribution and daily index for the latest monitoring period.</p>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="inner-surface rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-lg shadow-slate-900/5 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Weekly risk distribution</h3>
                <p className="mt-1 text-xs text-slate-500">Number of Low / Medium / High days in the latest week</p>
              </div>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {distributionData?.total_days ?? 0} days
              </span>
            </div>
            <div className="h-52">
              {distributionLoading && !distributionData ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">Calculating daily risks…</div>
              ) : distributionError ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-rose-600">Unable to load the daily distribution.</div>
              ) : distributionData?.total_days ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distribution} dataKey="count" nameKey="level" innerRadius={48} outerRadius={76} paddingAngle={3}>
                      {distribution.map((entry) => <Cell key={entry.level} fill={RISK_COLORS[entry.level]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} days`, 'Weekly count']} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">No daily evaluations in this interval.</div>
              )}
            </div>
          </div>

          <div className="inner-surface rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-lg shadow-slate-900/5 backdrop-blur">
            <h3 className="font-semibold text-slate-900">Daily risk score</h3>
            <p className="mt-1 text-xs text-slate-500">0–100 water-risk index for each day in the latest week</p>
            {dailyScores.length ? (
              <div className="mt-3 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyScores} margin={{ left: -18, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} ticks={[0, 33, 67, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      labelFormatter={(label) => `Date: ${label}`}
                      formatter={(value) => [`${Number(value).toFixed(1)} / 100`, 'Risk score']}
                    />
                    <Line type="monotone" dataKey="risk_score" stroke={RISK_COLORS[evaluation.risk_level]} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">No daily risk scores are available for this week.</p>
            )}
          </div>
          </div>
        </section>

        <div className="h-full lg:col-span-2 lg:col-start-5 lg:self-stretch">
          {evidence}
        </div>
      </div>
    </section>
  )
}
