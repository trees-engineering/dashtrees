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
  matchingStarted: boolean
  roleId: string
  title: string
  requirementsInserted: number
  tetCompleteness: number
  visionUsed: boolean
  jdTextLength: number
}

export async function uploadJD(file: File): Promise<UploadResult> {
  const content_base64 = await fileToBase64(file)
  return postJson<UploadResult>('/api/roles/upload', {
    filename: file.name,
    mime_type: file.type || undefined,
    content_base64,
  })
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
