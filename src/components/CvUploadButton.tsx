import { UserRoundPlus } from 'lucide-react'

interface CvUploadButtonProps {
  onAddCandidate: () => void
}

/** "Add candidate" button — opens the NewCandidateScreen. */
export function CvUploadButton({ onAddCandidate }: CvUploadButtonProps) {
  return (
    <button
      data-telemetry-id="cv-upload"
      onClick={onAddCandidate}
      className="flex items-center gap-1.5 text-xs font-semibold border border-primary text-primary px-3 py-1.5 rounded-lg active:bg-primary/10 transition-colors"
    >
      <UserRoundPlus size={14} />
      Add candidate
    </button>
  )
}
