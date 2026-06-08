import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { AlertTriangle, MousePointerClick } from 'lucide-react'
import { fetchAnalyticsOverview, type AnalyticsOverview } from '../lib/api'
import { telemetry } from '../lib/telemetry'
import { StatCard } from './StatCard'

interface AnalyticsTabProps {
  /** Selected recruiter email (admin header dropdown). Empty = org-wide. */
  recruiterFilter: string
}

// Theme tokens (Recharts needs explicit hex, not Tailwind classes).
const C = {
  primary: '#4888f8',   // cobalt — Events line / bars
  blue: '#48c8f8',      // cyan — Sessions line (distinct from primary)
  grid: '#e4ebf6',
  axis: '#5a6b89',
  surface: '#ffffff',
  border: '#d4ddee',
  text: '#16263f',
  red: '#f04857',
  orange: '#ea7a1e',
}

const DAY_OPTIONS = [7, 30, 90] as const

function fmtMs(ms: number): string {
  if (ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`
}

function fmtDay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Analytics tab — admin-only visualization of recruiter UX telemetry. All
// aggregation happens server-side (analytics_overview RPC); this renders the
// returned blob. Scope follows the same header dropdown the other tabs use.
export function AnalyticsTab({ recruiterFilter }: AnalyticsTabProps) {
  const [days, setDays] = useState<number>(30)
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    telemetry.capture('analytics_viewed', { days, scope: recruiterFilter || 'all' })
    telemetry
      .timed(
        'analytics_overview_fetch',
        () => fetchAnalyticsOverview({ days, recruiterScope: recruiterFilter || undefined }),
        { thresholdMs: 4000 },
      )
      .then((overview) => {
        if (!cancelled) setData(overview)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days, recruiterFilter])

  const scopeNote = recruiterFilter ? `Scoped to ${recruiterFilter}` : 'Org-wide (all recruiters)'

  const tabChartData = useMemo(
    () => (data?.tabs ?? []).map((t) => ({ tab: t.tab, seconds: Math.round(t.avg_ms / 1000), views: t.views })),
    [data],
  )

  return (
    <div className="p-4 space-y-5">
      {/* Header + window picker */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider">
            UX Analytics
          </h2>
          <p className="text-xs text-treeTextSec mt-1">
            Recruiter behavior from in-app telemetry. {scopeNote}.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-treeSurface border border-treeBorder rounded-lg p-0.5 self-start">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              data-telemetry-id={`analytics-days-${d}`}
              onClick={() => setDays(d)}
              className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                days === d ? 'bg-primary text-white' : 'text-treeTextSec hover:text-treeText'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {data == null && loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-treeSurface border border-treeBorder rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-treeSurface border border-treeBorder rounded-xl animate-pulse" />
        </div>
      ) : data == null ? (
        <p className="text-treeTextSec text-sm italic py-4">No telemetry for this window.</p>
      ) : (
        <>
          {/* ── Stat tiles ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <StatCard value={data.summary.sessions} label="Sessions" />
            <StatCard value={data.summary.active_recruiters} label="Recruiters" />
            <StatCard value={data.summary.rage_clicks} label="Rage clicks" />
            <StatCard value={data.summary.dead_clicks} label="Dead clicks" />
            <StatCard value={data.summary.errors} label="Errors" />
            <StatCard value={fmtMs(data.summary.avg_load_ms)} label="Avg load" />
          </div>

          {/* ── Activity per day ────────────────────────────────────────── */}
          <Section title="Activity">
            {data.by_day.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.by_day} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickFormatter={fmtDay} stroke={C.axis} fontSize={11} />
                  <YAxis stroke={C.axis} fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }}
                    labelFormatter={(v) => fmtDay(String(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: C.axis }} />
                  <Line type="monotone" dataKey="events" stroke={C.primary} strokeWidth={2} dot={false} name="Events" />
                  <Line type="monotone" dataKey="sessions" stroke={C.blue} strokeWidth={2} dot={false} name="Sessions" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Section>

          {/* ── Tab engagement ──────────────────────────────────────────── */}
          <Section title="Avg time per tab">
            {tabChartData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tabChartData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="tab" stroke={C.axis} fontSize={11} />
                  <YAxis stroke={C.axis} fontSize={11} unit="s" />
                  <Tooltip
                    cursor={{ fill: 'rgba(72,136,248,0.08)' }}
                    contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }}
                    formatter={(v) => [`${v}s`, 'Avg dwell']}
                  />
                  <Bar dataKey="seconds" fill={C.primary} radius={[4, 4, 0, 0]} name="Avg dwell" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Section>

          {/* ── Frustration (the headline) ──────────────────────────────── */}
          <Section title="Frustration signals" icon={<MousePointerClick size={13} className="text-statusOrange" />}>
            {data.frustration.length === 0 ? (
              <Empty label="No rage or dead clicks. (´• ω •`)" />
            ) : (
              <div className="bg-treeSurface border border-treeBorder rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-treeTextSec border-b border-treeBorderLight">
                      <th className="px-3 py-2 font-medium">Target</th>
                      <th className="px-3 py-2 font-medium">Kind</th>
                      <th className="px-3 py-2 font-medium text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-treeBorderLight">
                    {data.frustration.map((f, i) => (
                      <tr key={`${f.target}-${f.kind}-${i}`}>
                        <td className="px-3 py-2 font-mono text-xs text-treeText truncate max-w-[240px]">{f.target}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                              f.kind === 'rage'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}
                          >
                            {f.kind}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-treeText">{f.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── Performance percentiles ─────────────────────────────────── */}
          <Section title="Operation latency">
            {data.performance.length === 0 ? (
              <Empty />
            ) : (
              <div className="bg-treeSurface border border-treeBorder rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-treeTextSec border-b border-treeBorderLight">
                      <th className="px-3 py-2 font-medium">Operation</th>
                      <th className="px-3 py-2 font-medium text-right">n</th>
                      <th className="px-3 py-2 font-medium text-right">p50</th>
                      <th className="px-3 py-2 font-medium text-right">p95</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-treeBorderLight">
                    {data.performance.map((p) => (
                      <tr key={p.name}>
                        <td className="px-3 py-2 font-mono text-xs text-treeText truncate max-w-[220px]">{p.name}</td>
                        <td className="px-3 py-2 text-right text-treeTextSec">{p.count}</td>
                        <td className="px-3 py-2 text-right text-treeText">{fmtMs(p.p50_ms)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${p.p95_ms >= 3000 ? 'text-orange-600' : 'text-treeText'}`}>
                          {fmtMs(p.p95_ms)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── Error feed ──────────────────────────────────────────────── */}
          <Section title="Recent errors" icon={<AlertTriangle size={13} className="text-statusRed" />}>
            {data.errors.length === 0 ? (
              <Empty label="No errors in this window. ✨" />
            ) : (
              <div className="bg-treeSurface border border-treeBorder rounded-xl divide-y divide-treeBorderLight max-h-80 overflow-y-auto">
                {data.errors.map((e, i) => (
                  <div key={i} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-red-700">{e.name}</span>
                      <span className="text-treeTextSec flex-shrink-0">
                        {new Date(e.ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    {e.message && <p className="text-treeText font-mono mt-0.5 break-words">{e.message}</p>}
                    {e.recruiter && <p className="text-treeTextSec mt-0.5">{e.recruiter}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-treeTextSec uppercase tracking-wider mb-2">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

function Empty({ label = 'No data for this window.' }: { label?: string }) {
  return <p className="text-treeTextSec text-sm italic py-3">{label}</p>
}
