import { useEffect, useState } from 'react'
import { Download, ExternalLink, Loader2, Trash2 } from 'lucide-react'
import {
  generateAndDownloadMonthlyReport,
  listSavedReports,
  fetchSavedReportBlob,
  deleteSavedReport,
  type SavedReportRow,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRecruiters } from '../hooks/useRecruiters'
import { useToast } from './Toast'
import { telemetry } from '../lib/telemetry'

interface ReportsTabProps {
  /** Currently selected recruiter email (admin header dropdown). Empty = "All". */
  recruiterFilter: string
}

// Reports tab — generate, list, view, download, and delete monthly database
// HTML reports. The scope (org-wide vs. one recruiter) is driven by the same
// header dropdown the other tabs use. For non-admins, scope is forced to
// themselves server-side.
export function ReportsTab({ recruiterFilter }: ReportsTabProps) {
  const { isAdmin } = useAuth()
  const { data: recruiters } = useRecruiters()
  const toast = useToast()
  const [monthFilter, setMonthFilter] = useState('')
  const [reports, setReports] = useState<SavedReportRow[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Header dropdown carries an email; the report endpoints want a recruiter id
  // (or 'all'). Resolve via the recruiters list (admin-only, already cached).
  // Non-admins send no scope param at all — the server forces them to self.
  const selectedRecruiterId = recruiterFilter
    ? (recruiters ?? []).find((r) => r.email === recruiterFilter)?.id ?? null
    : null
  const adminScope: string = selectedRecruiterId ?? 'all'
  const scopeForGenerate: string | undefined = isAdmin ? adminScope : undefined
  const scopeForList: string | undefined = isAdmin ? adminScope : undefined

  async function loadList() {
    setListError(null)
    try {
      const rows = await listSavedReports({
        month: monthFilter || undefined,
        recruiterScope: scopeForList,
      })
      setReports(rows)
    } catch (err) {
      setListError((err as Error).message)
      setReports([])
    }
  }

  useEffect(() => {
    void loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthFilter, scopeForList])

  async function handleGenerate() {
    setGenerating(true)
    const id = toast.show('loading', 'Generating monthly report…')
    try {
      const filename = await telemetry.timed(
        'monthly_report_generate',
        () => generateAndDownloadMonthlyReport({ recruiterScope: scopeForGenerate }),
        { thresholdMs: 10000 },
      )
      telemetry.capture('monthly_report_generated', { filename, scope: scopeForGenerate ?? 'self' })
      toast.update(id, 'success', `Generated · ${filename}`)
      await loadList()
    } catch (err) {
      toast.update(id, 'error', `Failed: ${(err as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  async function handleView(row: SavedReportRow) {
    setBusyId(row.id)
    try {
      const { blobUrl } = await fetchSavedReportBlob(row.id)
      telemetry.capture('monthly_report_viewed', { report_id: row.id })
      window.open(blobUrl, '_blank', 'noopener')
      // Revoke after a delay so the new tab has time to load the URL.
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch (err) {
      toast.show('error', `Open failed: ${(err as Error).message}`)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDownload(row: SavedReportRow) {
    setBusyId(row.id)
    try {
      const { blobUrl, filename } = await fetchSavedReportBlob(row.id)
      telemetry.capture('monthly_report_downloaded', { report_id: row.id })
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5_000)
    } catch (err) {
      toast.show('error', `Download failed: ${(err as Error).message}`)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(row: SavedReportRow) {
    if (!window.confirm(`Delete the saved report for ${row.period_label}? This cannot be undone.`)) {
      telemetry.capture('monthly_report_delete_cancelled', { report_id: row.id })
      return
    }
    setBusyId(row.id)
    try {
      await deleteSavedReport(row.id)
      telemetry.capture('monthly_report_deleted', { report_id: row.id })
      toast.show('success', 'Report deleted.')
      await loadList()
    } catch (err) {
      toast.show('error', `Delete failed: ${(err as Error).message}`)
    } finally {
      setBusyId(null)
    }
  }

  const scopeNote = isAdmin
    ? recruiterFilter
      ? `Scoped to ${recruiterFilter}`
      : 'Org-wide (all recruiters)'
    : 'Scoped to your own roles and candidates'

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider">
          Monthly Reports
        </h2>
        <p className="text-xs text-treeTextSec mt-1">
          Generates a self-contained HTML database report for the previous
          calendar month. {scopeNote}. Each generation is saved below.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          data-telemetry-id="report-generate"
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 text-sm font-semibold bg-primary text-white px-4 py-2 rounded-lg active:bg-primaryDark transition-colors disabled:opacity-50"
        >
          {generating
            ? <Loader2 size={14} className="animate-spin" />
            : <Download size={14} />}
          Generate previous month
        </button>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider mb-2">
          Saved reports
        </h3>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-treeTextSec">
            Filter by month
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="ml-2 bg-treeSurface border border-treeBorder text-treeText rounded px-2 py-1 text-xs"
              style={{ colorScheme: 'dark' }}
            />
          </label>
          {monthFilter && (
            <button
              onClick={() => setMonthFilter('')}
              className="text-xs text-treeTextSec hover:text-treeText underline"
            >
              Clear
            </button>
          )}
        </div>

        {listError && (
          <p className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {listError}
          </p>
        )}

        {reports == null ? (
          <div className="h-12 bg-treeSurface border border-treeBorder rounded-xl animate-pulse" />
        ) : reports.length === 0 ? (
          <p className="text-treeTextSec text-sm italic py-4">No reports for this filter.</p>
        ) : (
          <div className="bg-treeSurface border border-treeBorder rounded-xl overflow-hidden">
            <ul className="divide-y divide-treeBorderLight">
              {reports.map((r) => {
                const busy = busyId === r.id
                const when = new Date(r.generated_at)
                const sizeKb = `${(r.size_bytes / 1024).toFixed(1)} KB`
                return (
                  <li key={r.id} className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-treeText">{r.period_label}</p>
                      <p className="text-xs text-treeTextSec mt-0.5">
                        {when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {sizeKb}
                      </p>
                      <p className="text-[11px] text-treeTextSec font-mono truncate mt-0.5">
                        {r.filename}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        data-telemetry-id="report-view"
                        onClick={() => handleView(r)}
                        disabled={busy}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded transition-colors disabled:opacity-50"
                      >
                        <ExternalLink size={12} /> View
                      </button>
                      <button
                        data-telemetry-id="report-download"
                        onClick={() => handleDownload(r)}
                        disabled={busy}
                        className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 px-2 py-1 rounded transition-colors disabled:opacity-50"
                      >
                        <Download size={12} /> Download
                      </button>
                      <button
                        data-telemetry-id="report-delete"
                        onClick={() => handleDelete(r)}
                        disabled={busy}
                        className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded transition-colors disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Delete
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
