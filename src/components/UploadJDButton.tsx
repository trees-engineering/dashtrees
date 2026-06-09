import { Upload } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useRecruiters } from '../hooks/useRecruiters'

interface PostRoleButtonProps {
  /** Currently selected recruiter email (admin dropdown). Empty = "All". */
  recruiterFilter: string
  /** Open the New-role screen (file upload OR paste text). */
  onPostRole: () => void
}

/** "Post a role" button — opens the New-role screen. Disabled for admins until
 *  a specific recruiter is selected, so the new role can be attributed to them.
 *  Non-admins are always scoped to their own recruiter id.
 *
 *  (File name kept as UploadJDButton.tsx to avoid churn; it no longer uploads
 *  directly — the upload/paste flow lives in NewRoleScreen.) */
export function UploadJDButton({ recruiterFilter, onPostRole }: PostRoleButtonProps) {
  const { isAdmin, recruiter } = useAuth()
  const { data: recruiters } = useRecruiters()

  const attributedRecruiterId = isAdmin
    ? recruiterFilter
      ? (recruiters ?? []).find((r) => r.email === recruiterFilter)?.id ?? null
      : null
    : recruiter?.id ?? null

  const disabled = !attributedRecruiterId

  return (
    <button
      data-telemetry-id="jd-upload"
      onClick={onPostRole}
      disabled={disabled}
      title={disabled ? 'Select a recruiter first to attribute the role' : undefined}
      className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-white px-3 py-1.5 rounded-lg active:bg-primaryDark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Upload size={14} />
      Post a role
    </button>
  )
}
