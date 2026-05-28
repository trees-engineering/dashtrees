import { useRef, useState } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { uploadJD } from '../lib/api'
import { useToast } from './Toast'
import { telemetry } from '../lib/telemetry'

const ACCEPT = '.pdf,.docx,.doc,.rtf,.odt,.txt'

/** "Upload JD" button — base64-encodes the chosen file and POSTs it to the
 *  backend, which ingests the role and kicks off matching in the background. */
export function UploadJDButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const queryClient = useQueryClient()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return

    setBusy(true)
    telemetry.capture('jd_upload_started', {
      filename: file.name,
      size_bytes: file.size,
      mime: file.type || null,
    })
    const toastId = toast.show('loading', `Uploading & extracting "${file.name}"…`)
    try {
      const result = await telemetry.timed(
        'jd_upload',
        () => uploadJD(file),
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
        `Role "${result.title}" created — ${result.requirementsInserted} requirement${result.requirementsInserted === 1 ? '' : 's'}, ${result.tetCompleteness}% TET coverage${result.visionUsed ? ' (vision OCR)' : ''}. Matching started — candidates appear in ~1 min.`,
      )
      queryClient.invalidateQueries({ queryKey: ['roles'] })
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
        disabled={busy}
        className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-treeBg px-3 py-1.5 rounded-lg active:bg-primaryDark transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        Upload JD
      </button>
    </>
  )
}
