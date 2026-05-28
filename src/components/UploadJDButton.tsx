import { useRef, useState } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { uploadJD } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRecruiters } from '../hooks/useRecruiters'
import { useToast } from './Toast'
import { telemetry } from '../lib/telemetry'

const ACCEPT = '.pdf,.docx,.doc,.rtf,.odt,.txt'

interface UploadJDButtonProps {
  /** Currently selected recruiter email (admin dropdown). Empty = "All". */
  recruiterFilter: string
  /** Fired after a successful upload so the parent can open the edit screen
   *  for the freshly-created role. */
  onUploadSuccess: (roleId: string) => void
}

/** "Upload JD" button — base64-encodes the chosen file and POSTs it to the
 *  backend, which ingests the role and kicks off matching in the background.
 *
 *  Attribution rules:
 *    - Non-admin → always their own recruiter.id
 *    - Admin + specific recruiter selected → that recruiter's id
 *    - Admin + "All recruiters" selected → disabled (no attribution possible)
 */
export function UploadJDButton({ recruiterFilter, onUploadSuccess }: UploadJDButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const queryClient = useQueryClient()
  const { isAdmin, recruiter } = useAuth()
  const { data: recruiters } = useRecruiters()

  // Resolve the recruiter the upload should be attributed to.
  const attributedRecruiterId = isAdmin
    ? recruiterFilter
      ? (recruiters ?? []).find((r) => r.email === recruiterFilter)?.id ?? null
      : null
    : recruiter?.id ?? null

  const disabled = busy || !attributedRecruiterId
  const disabledReason = !attributedRecruiterId
    ? 'Select a recruiter first to attribute the role'
    : undefined

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (!attributedRecruiterId) {
      // Defensive — the button should be disabled, but if a click slips
      // through, surface why the upload can't proceed.
      toast.show('error', 'Select a recruiter from the dropdown before uploading a JD.')
      return
    }

    setBusy(true)
    telemetry.capture('jd_upload_started', {
      filename: file.name,
      size_bytes: file.size,
      mime: file.type || null,
      attributed_to: attributedRecruiterId,
    })
    const toastId = toast.show('loading', `Uploading & extracting "${file.name}"…`)
    try {
      const result = await telemetry.timed(
        'jd_upload',
        () => uploadJD(file, attributedRecruiterId),
        { thresholdMs: 8000, props: { filename: file.name } },
      )
      telemetry.capture('jd_upload_completed', {
        filename: file.name,
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
      // Open the edit screen so the recruiter can verify what the LLM
      // extracted before matching runs against it.
      onUploadSuccess(result.roleId)
    } catch (err) {
      telemetry.capture('jd_upload_failed', {
        filename: file.name,
        error_message: (err as Error).message?.slice(0, 200),
      })
      toast.update(toastId, 'error', `Upload failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFile}
        className="hidden"
      />
      <button
        data-telemetry-id="jd-upload"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title={disabledReason}
        className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-treeBg px-3 py-1.5 rounded-lg active:bg-primaryDark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        Upload JD
      </button>
    </>
  )
}
