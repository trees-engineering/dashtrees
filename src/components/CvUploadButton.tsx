import { useRef, useState } from 'react'
import { UserRoundPlus, Loader2, Check } from 'lucide-react'
import { uploadNewCandidate } from '../lib/api'
import { telemetry } from '../lib/telemetry'

type UploadState = 'idle' | 'uploading' | 'done' | 'error'

/** Top-of-page "Add candidate" button — sits next to Post a role / Talk to Treelance. */
export function CvUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [label, setLabel] = useState('Add candidate')

  async function handleFile(file: File) {
    setState('uploading')
    setLabel('Uploading…')
    telemetry.capture('candidate_cv_upload_started', { filename: file.name })
    try {
      const result = await uploadNewCandidate(file)
      setState('done')
      setLabel(result.name ? `Added ${result.name.split(' ')[0]}` : 'Candidate added')
      telemetry.capture('candidate_cv_upload_success', { talent_id: result.talentId, name: result.name })
      setTimeout(() => {
        setState('idle')
        setLabel('Add candidate')
      }, 3000)
    } catch (err) {
      setState('error')
      setLabel('Upload failed')
      telemetry.capture('candidate_cv_upload_failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      setTimeout(() => {
        setState('idle')
        setLabel('Add candidate')
      }, 3000)
    }
  }

  const isDisabled = state === 'uploading'

  return (
    <>
      <button
        data-telemetry-id="cv-upload"
        disabled={isDisabled}
        onClick={() => inputRef.current?.click()}
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          state === 'error'
            ? 'bg-red-100 text-red-700 border border-red-300'
            : state === 'done'
              ? 'bg-green-100 text-green-700 border border-green-300'
              : 'border border-primary text-primary active:bg-primary/10'
        }`}
      >
        {state === 'uploading' && <Loader2 size={14} className="animate-spin" />}
        {state === 'done' && <Check size={14} />}
        {state !== 'uploading' && state !== 'done' && <UserRoundPlus size={14} />}
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.rtf,.odt"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </>
  )
}
