import { useEffect, useRef, useState } from 'react'
import { X, FileDown, Loader2, Upload } from 'lucide-react'
import { exportDocument, fileToText, type ExportRequest } from '../lib/api'
import { useToast } from './Toast'
import { telemetry } from '../lib/telemetry'

interface ExportDocumentPanelProps {
  talentId: string
  roleId: string
  talentName: string
  onClose: () => void
}

function Checkbox({
  checked, onChange, label, hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-2.5 text-left py-2"
    >
      <span
        className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
          checked ? 'bg-primary border-primary' : 'bg-treeSurface border-treeBorder'
        }`}
      >
        {checked && (
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-treeText">{label}</span>
        {hint && <span className="block text-xs text-treeTextSec mt-0.5">{hint}</span>}
      </span>
    </button>
  )
}

/** Modal: pick CV / dossier export options, then generate + download. */
export function ExportDocumentPanel({ talentId, roleId, talentName, onClose }: ExportDocumentPanelProps) {
  const [format, setFormat] = useState<'docx' | 'pdf'>('docx')
  const [appendCv, setAppendCv] = useState(false)
  const [tailorToJd, setTailorToJd] = useState(false)
  const [includeInterview, setIncludeInterview] = useState(false)
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const transcriptInputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  // Appending the original CV merges PDFs — output is forced to PDF.
  const effectiveFormat: 'docx' | 'pdf' = appendCv ? 'pdf' : format
  const missingTranscript = includeInterview && !transcriptFile

  useEffect(() => {
    return () => {
      telemetry.capture('export_panel_closed', { role_id: roleId, talent_id: talentId })
    }
  }, [roleId, talentId])

  function handleOptionToggle(option: string, value: boolean) {
    telemetry.capture('export_options_changed', {
      role_id: roleId,
      talent_id: talentId,
      option,
      value,
    })
  }

  async function handleGenerate() {
    if (busy || missingTranscript) return
    setBusy(true)
    telemetry.capture('dossier_export_started', {
      role_id: roleId,
      talent_id: talentId,
      format: effectiveFormat,
      tailor_to_jd: tailorToJd,
      append_cv: appendCv,
      include_interview: includeInterview,
    })
    const toastId = toast.show('loading', `Generating document for ${talentName}…`)
    try {
      let transcript: string | null = null
      if (includeInterview && transcriptFile) {
        transcript = await fileToText(transcriptFile)
      }
      const req: ExportRequest = {
        roleId,
        format: effectiveFormat,
        tailorToJd,
        appendCv,
        includeInterview,
        transcript,
      }
      const filename = await telemetry.timed(
        'dossier_export',
        () => exportDocument(talentId, req),
        { thresholdMs: 15_000, props: { role_id: roleId, talent_id: talentId } },
      )
      telemetry.capture('dossier_export_completed', {
        role_id: roleId,
        talent_id: talentId,
        format: effectiveFormat,
        filename,
      })
      toast.update(toastId, 'success', `Downloaded ${filename}`)
      onClose()
    } catch (err) {
      telemetry.capture('dossier_export_failed', {
        role_id: roleId,
        talent_id: talentId,
        format: effectiveFormat,
        error_message: (err as Error).message?.slice(0, 200),
      })
      toast.update(toastId, 'error', `Export failed: ${(err as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-treeSurface w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-treeBorder shadow-xl max-h-[88dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-treeBorderLight">
          <h3 className="text-sm font-semibold text-treeText">Export Document</h3>
          <button onClick={onClose} className="text-treeTextSec active:text-treeText" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-treeTextSec">{talentName}</p>

          {/* Output format */}
          <div>
            <p className="text-xs font-semibold text-treeTextSec uppercase tracking-wider mb-1.5">
              Output format
            </p>
            <div className="flex gap-2">
              {(['docx', 'pdf'] as const).map((f) => {
                const active = effectiveFormat === f
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    disabled={appendCv}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-60 ${
                      active
                        ? 'bg-primary text-white border-primary'
                        : 'bg-treeSurface text-treeText border-treeBorder'
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                )
              })}
            </div>
            {appendCv && (
              <p className="text-xs text-treeTextSec mt-1.5">
                Output is PDF — required to append the original CV.
              </p>
            )}
          </div>

          {/* Content options */}
          <div className="border-t border-treeBorderLight pt-1">
            <Checkbox
              checked={tailorToJd}
              onChange={(v) => { setTailorToJd(v); handleOptionToggle('tailor_to_jd', v) }}
              label="Tailor to this role's JD"
              hint="Targeted dossier — mission, why-this-profile, needs↔candidate matrix."
            />
            <Checkbox
              checked={appendCv}
              onChange={(v) => { setAppendCv(v); handleOptionToggle('append_cv', v) }}
              label="Append original CV"
              hint="Adds the candidate's uploaded CV after the generated document."
            />
            <Checkbox
              checked={includeInterview}
              onChange={(v) => {
                setIncludeInterview(v)
                if (!v) setTranscriptFile(null)
                handleOptionToggle('include_interview', v)
              }}
              label="Include interview insights"
              hint="Adds a Qualification Interview section from a pre-screening transcript."
            />

            {/* Transcript upload — revealed only when interview insights is on */}
            {includeInterview && (
              <div className="ml-7 mt-1 mb-1">
                <input
                  ref={transcriptInputRef}
                  type="file"
                  accept=".txt,.md"
                  onChange={(e) => setTranscriptFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => transcriptInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-medium border border-treeBorder text-treeText rounded-lg px-2.5 py-1.5"
                >
                  <Upload size={13} />
                  {transcriptFile ? transcriptFile.name : 'Choose transcript (.txt / .md)'}
                </button>
              </div>
            )}
          </div>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={busy || missingTranscript}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold active:bg-primaryDark transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            {busy ? 'Generating…' : `Generate ${effectiveFormat.toUpperCase()}`}
          </button>
          {missingTranscript && (
            <p className="text-xs text-treeTextSec text-center">
              Choose a transcript file, or uncheck "Include interview insights".
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
