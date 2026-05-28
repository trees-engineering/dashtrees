// Client for the DashTrees backend (server/). Calls are relative ("/api/*"):
// the Vite dev proxy forwards them in dev, and the Express server serves the
// built SPA same-origin in production. VITE_API_BASE can override the origin.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return (data?.error as string) ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(await readError(res))

  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] ?? `export.${req.format}`

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
