import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Upload, FileText, Loader2, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { uploadJD, importRoleText } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRecruiters } from '../hooks/useRecruiters'
import { useToast } from './Toast'
import { telemetry } from '../lib/telemetry'

const ACCEPT = '.pdf,.docx,.doc,.rtf,.odt,.txt'
const MIN_TEXT = 50 // keep in sync with JD_TEXT_MIN on the server

interface NewRoleScreenProps {
  /** Selected recruiter email (admin dropdown). Empty = none selected. */
  recruiterFilter: string
  /** Back button — no role created. */
  onClose: () => void
  /** Fired after a role is created, with its id, so the parent can open the
   *  review/edit screen (matching is gated on the recruiter confirming there). */
  onCreated: (roleId: string) => void
}

/**
 * Full-screen "New role" flow. Two ways to supply the JD — drop/browse a file
 * or paste the text — both converging on the same server ingestion (LLM
 * extraction → role + requirements → review). If both are provided, the file
 * wins. Attribution mirrors the old upload button: admins must have a recruiter
 * selected; non-admins are scoped to themselves.
 */
export function NewRoleScreen({ recruiterFilter, onClose, onCreated }: NewRoleScreenProps) {
  const { isAdmin, recruiter } = useAuth()
  const { data: recruiters } = useRecruiters()
  const toast = useToast()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    telemetry.capture('role_create_opened', {})
  }, [])

  const attributedRecruiterId = isAdmin
    ? recruiterFilter
      ? (recruiters ?? []).find((r) => r.email === recruiterFilter)?.id ?? null
      : null
    : recruiter?.id ?? null

  const trimmed = text.trim()
  const textReady = trimmed.length >= MIN_TEXT
  const canCreate = !busy && Boolean(attributedRecruiterId) && (Boolean(file) || textReady)

  async function handleCreate() {
    if (!attributedRecruiterId) {
      toast.show('error', 'Select a recruiter from the header dropdown to attribute this role.')
      return
    }
    if (!file && !textReady) return

    setBusy(true)
    const method = file ? 'file' : 'text'
    const toastId = toast.show(
      'loading',
      file ? `Uploading & extracting "${file.name}"...` : 'Reading the job text...',
    )
    telemetry.capture('role_create_submitted', { method, text_length: file ? null : text.length })
    try {
      const result = await telemetry.timed(
        method === 'file' ? 'jd_upload' : 'jd_paste',
        () => (file ? uploadJD(file, attributedRecruiterId) : importRoleText(text, attributedRecruiterId)),
        { thresholdMs: 8000, props: { method } },
      )
      telemetry.capture('role_created', {
        method,
        role_id: result.roleId,
        requirements: result.requirementsInserted,
        tet_completeness: result.tetCompleteness,
        vision_used: result.visionUsed,
        jd_text_length: result.jdTextLength,
      })
      toast.update(
        toastId,
        'success',
        `Role "${result.title}" created — ${result.requirementsInserted} requirement${result.requirementsInserted === 1 ? '' : 's'}, ${result.tetCompleteness}% TET coverage${result.visionUsed ? ' (vision OCR)' : ''}. Review and confirm to start matching.`,
      )
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      onCreated(result.roleId)
    } catch (err) {
      telemetry.capture('role_create_failed', { method, error_message: (err as Error).message?.slice(0, 200) })
      toast.update(toastId, 'error', `Create failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-treeBg">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-4 h-[50px] flex items-center gap-3 z-10">
        <button
          data-telemetry-id="new-role-back"
          onClick={() => { if (!busy) onClose() }}
          disabled={busy}
          className="flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900 -ml-2 px-2 py-1 rounded disabled:opacity-50"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <h1 className="text-sm font-semibold text-slate-800 truncate flex-1">New role</h1>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
          <p className="text-sm text-treeTextSec">
            Drop a job description file or paste the text — we'll extract the role and let you
            review it before matching.
          </p>

          {!attributedRecruiterId && (
            <p className="text-sm text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
              Select a recruiter from the header dropdown first, so the role can be attributed.
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {/* File dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f) }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 flex flex-col items-center justify-center text-center min-h-[180px] transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-treeBorder bg-treeSurface hover:border-primaryLight'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }}
              />
              <Upload size={24} className="text-primary mb-2" />
              {file ? (
                <div className="flex items-center gap-2 text-sm text-treeText">
                  <FileText size={16} className="text-treeTextSec flex-shrink-0" />
                  <span className="truncate max-w-[180px]">{file.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null) }}
                    aria-label="Remove file"
                    className="text-treeTextSec hover:text-statusRed flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium text-treeText">Drop a file or click to browse</p>
                  <p className="text-xs text-treeTextSec mt-1">PDF, DOCX, DOC, RTF, ODT, TXT</p>
                </>
              )}
            </div>

            {/* Paste text */}
            <div className="flex flex-col">
              <textarea
                data-telemetry-id="new-role-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="...or paste the job description text here"
                className="flex-1 min-h-[180px] rounded-xl border border-treeBorder bg-treeSurface text-treeText text-sm p-3 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              />
              <p className="text-[11px] text-treeTextSec mt-1 text-right">
                {trimmed.length > 0 && trimmed.length < MIN_TEXT
                  ? `${MIN_TEXT - trimmed.length} more characters needed`
                  : `${text.length} characters`}
              </p>
            </div>
          </div>

          {file && textReady && (
            <p className="text-[11px] text-treeTextSec italic">
              A file is attached — it will be used, and the pasted text ignored.
            </p>
          )}

          <div className="flex justify-end">
            <button
              data-telemetry-id="new-role-create"
              onClick={handleCreate}
              disabled={!canCreate}
              className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-lg active:bg-primaryDark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {busy ? 'Creating...' : 'Create role'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
