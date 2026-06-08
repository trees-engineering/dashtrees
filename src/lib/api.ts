// Client for the DashTrees backend (server/). Calls are relative ("/api/*"):
// the Vite dev proxy forwards them in dev, and the Express server serves the
// built SPA same-origin in production. VITE_API_BASE can override the origin.
import { supabase } from './supabase'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return (data?.error as string) ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

// All mutation endpoints on the server require a Bearer token. Telemetry
// stays open and uses fetch directly, so it doesn't go through here.
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json() as Promise<T>
}

/** Read a File as a base64 string (no data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

/** Read a File as UTF-8 text (for the interview transcript). */
export function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string) ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.readAsText(file)
  })
}

// ── Feature A: JD upload ──────────────────────────────────────────────────────
export interface UploadResult {
  ok: boolean
  roleId: string
  title: string
  requirementsInserted: number
  tetCompleteness: number
  visionUsed: boolean
  jdTextLength: number
}

export async function uploadJD(file: File, createdBy: string): Promise<UploadResult> {
  const content_base64 = await fileToBase64(file)
  return postJson<UploadResult>('/api/roles/upload', {
    filename: file.name,
    mime_type: file.type || undefined,
    content_base64,
    created_by: createdBy,
  })
}

// Kick off the matching cascade for a freshly-confirmed role. Fire-and-forget
// on the server, so this resolves immediately. The actual work takes minutes
// and runs in the background.
export interface StartMatchingResult {
  ok: boolean
  started: boolean
}

export function startMatching(roleId: string): Promise<StartMatchingResult> {
  return postJson<StartMatchingResult>(`/api/roles/${roleId}/start-matching`, {})
}

// ── Feature B: rerun matching ─────────────────────────────────────────────────
export interface RerunResult {
  ok: boolean
  total: number
  scored: number
  plan_b: number
}

export function rerunMatches(roleId: string): Promise<RerunResult> {
  return postJson<RerunResult>(`/api/roles/${roleId}/rerun-matches`, {})
}

// ── Manual role status update (e.g. close a job) ──────────────────────────────
export type RoleStatus = 'open' | 'closed' | 'draft'

export interface UpdateRoleStatusResult {
  ok: boolean
  status: RoleStatus
}

export async function updateRoleStatus(roleId: string, status: RoleStatus): Promise<UpdateRoleStatusResult> {
  const res = await fetch(`${API_BASE}/api/roles/${roleId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json() as Promise<UpdateRoleStatusResult>
}

// ── Role edit ─────────────────────────────────────────────────────────────────
// Only the basic recruiter-editable fields. TET v2 / requirements are
// LLM-derived and not in this patch surface.
export interface RolePatch {
  title?: string
  description?: string | null
  status?: RoleStatus
  location_requirement?: string | null
  location_regions?: string[] | null
  salary_min?: number | null
  salary_max?: number | null
  budget_currency?: string | null
  start_deadline?: string | null
  provides_sponsorship?: boolean | null
}

export async function updateRole(roleId: string, patch: RolePatch): Promise<{ ok: true; role: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/roles/${roleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json() as Promise<{ ok: true; role: Record<string, unknown> }>
}

// ── Feature C: configurable export ────────────────────────────────────────────
export interface ExportRequest {
  roleId: string
  format: 'docx' | 'pdf'
  tailorToJd: boolean
  appendCv: boolean
  includeInterview: boolean
  transcript?: string | null
}

/** Generate a CV / dossier and trigger a browser download. */
export async function exportDocument(talentId: string, req: ExportRequest): Promise<string> {
  const res = await fetch(`${API_BASE}/api/talent/${talentId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(req),
  })
  return finishBlobDownload(res, `export.${req.format}`)
}

// ── Monthly reports ───────────────────────────────────────────────────────────
export interface SavedReportRow {
  id: string
  client_label: string
  workspace_id: string | null
  recruiter_id: string | null
  period_year: number
  period_month: number
  period_label: string
  filename: string
  size_bytes: number
  generated_at: string
}

/** Generate the current scope's monthly report, persist server-side, and
 *  trigger a browser download. recruiterScope only matters for admins; the
 *  server forces non-admins to their own scope regardless. */
export async function generateAndDownloadMonthlyReport(opts: {
  /** 'all' | a recruiter UUID | undefined. Admin-only; ignored for non-admin. */
  recruiterScope?: string
}): Promise<string> {
  const qs = opts.recruiterScope ? `?recruiter_id=${encodeURIComponent(opts.recruiterScope)}` : ''
  const res = await fetch(`${API_BASE}/api/report/monthly${qs}`, {
    method: 'POST',
    headers: { ...(await authHeaders()) },
  })
  if (!res.ok) throw new Error(await readError(res))
  return finishBlobDownload(res, 'report.html')
}

export async function listSavedReports(filter: {
  month?: string // 'YYYY-MM'
  recruiterScope?: string // 'all' | UUID
}): Promise<SavedReportRow[]> {
  const params = new URLSearchParams()
  if (filter.month) params.set('month', filter.month)
  if (filter.recruiterScope) params.set('recruiter_id', filter.recruiterScope)
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(`${API_BASE}/api/report/monthly/list${qs}`, {
    headers: { ...(await authHeaders()) },
  })
  if (!res.ok) throw new Error(await readError(res))
  const json = (await res.json()) as { reports: SavedReportRow[] }
  return json.reports ?? []
}

/** Fetch a saved report's HTML as a blob URL for viewing or downloading. The
 *  caller must revokeObjectURL when done. */
export async function fetchSavedReportBlob(id: string): Promise<{ blobUrl: string; filename: string }> {
  const res = await fetch(`${API_BASE}/api/report/monthly/${id}`, {
    headers: { ...(await authHeaders()) },
  })
  if (!res.ok) throw new Error(await readError(res))
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] ?? `report-${id}.html`
  const blob = await res.blob()
  return { blobUrl: URL.createObjectURL(blob), filename }
}

export async function deleteSavedReport(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/report/monthly/${id}`, {
    method: 'DELETE',
    headers: { ...(await authHeaders()) },
  })
  if (!res.ok) throw new Error(await readError(res))
}

// ── Analytics overview (admin-only) ───────────────────────────────────────────
// One RPC-backed call that returns every section of the Analytics tab. The
// server aggregates in Postgres; we just type the shape and unwrap `overview`.
export interface AnalyticsOverview {
  summary: {
    total_events: number
    sessions: number
    active_recruiters: number
    rage_clicks: number
    dead_clicks: number
    errors: number
    avg_load_ms: number
  }
  by_day: { day: string; events: number; sessions: number }[]
  tabs: { tab: string; views: number; total_ms: number; avg_ms: number }[]
  frustration: { target: string; kind: 'rage' | 'dead'; count: number }[]
  errors: { ts: string; recruiter: string | null; name: string; message: string }[]
  performance: { name: string; count: number; p50_ms: number; p95_ms: number }[]
  scroll: { tab: string; pct: number; count: number }[]
}

/** Fetch the admin analytics overview. recruiterScope is an email (one
 *  recruiter) or undefined (org-wide). days is 7 | 30 | 90. */
export async function fetchAnalyticsOverview(opts: {
  days: number
  recruiterScope?: string
}): Promise<AnalyticsOverview> {
  const params = new URLSearchParams({ days: String(opts.days) })
  if (opts.recruiterScope) params.set('recruiter', opts.recruiterScope)
  const res = await fetch(`${API_BASE}/api/analytics/overview?${params.toString()}`, {
    headers: { ...(await authHeaders()) },
  })
  if (!res.ok) throw new Error(await readError(res))
  const json = (await res.json()) as { overview: AnalyticsOverview }
  return json.overview
}

// ── Blob download helper ──────────────────────────────────────────────────────
// Shared by exportDocument + generateAndDownloadMonthlyReport. Reads
// filename from Content-Disposition, falls back to the caller's name,
// triggers the browser download, and returns the filename used.
async function finishBlobDownload(res: Response, fallbackName: string): Promise<string> {
  if (!res.ok) throw new Error(await readError(res))
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] ?? fallbackName
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return filename
}

