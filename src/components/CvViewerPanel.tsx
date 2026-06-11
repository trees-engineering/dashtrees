import { useEffect, useState } from 'react'
import { X, Download, Loader2, FileText } from 'lucide-react'
import { fetchTalentCvBlob } from '../lib/api'
import { telemetry } from '../lib/telemetry'

interface CvViewerPanelProps {
  talentId: string
  roleId: string
  talentName: string
  onClose: () => void
}

/** Candidate's original uploaded CV. On desktop it docks inline to the right of
 *  the match card (pushing the card content left); on mobile it takes the full
 *  screen. PDFs render inline; other formats (DOCX/DOC) fall back to a download,
 *  since browsers can't preview them natively. */
export function CvViewerPanel({ talentId, roleId, talentName, onClose }: CvViewerPanelProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cv, setCv] = useState<{ blobUrl: string; filename: string; contentType: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    telemetry.capture('cv_viewer_opened', { role_id: roleId, talent_id: talentId })
    fetchTalentCvBlob(talentId, roleId)
      .then((result) => {
        if (cancelled) {
          URL.revokeObjectURL(result.blobUrl)
          return
        }
        createdUrl = result.blobUrl
        setCv(result)
        setLoading(false)
        telemetry.capture('cv_viewer_loaded', {
          role_id: roleId,
          talent_id: talentId,
          content_type: result.contentType,
        })
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
        telemetry.capture('cv_viewer_failed', {
          role_id: roleId,
          talent_id: talentId,
          error_message: err.message?.slice(0, 200),
        })
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
      telemetry.capture('cv_viewer_closed', { role_id: roleId, talent_id: talentId })
    }
  }, [talentId, roleId])

  const isPdf = cv?.contentType.includes('pdf') ?? false

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-treeSurface shadow-xl sm:static sm:z-auto sm:w-1/2 sm:max-w-2xl sm:h-[80dvh] sm:self-start sm:rounded-xl sm:border sm:border-treeBorder">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-treeBorderLight flex-shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-treeText">CV</h3>
          <p className="text-xs text-treeTextSec truncate">{talentName}</p>
        </div>
        <div className="flex items-center gap-1">
          {cv && (
            <a
              href={cv.blobUrl}
              download={cv.filename}
              onClick={() => telemetry.capture('cv_downloaded', { role_id: roleId, talent_id: talentId })}
              className="flex items-center gap-1.5 text-xs font-medium border border-treeBorder text-treeText rounded-lg px-2.5 py-1.5 active:bg-treeBg"
            >
              <Download size={14} />
              Download
            </a>
          )}
          <button onClick={onClose} className="text-treeTextSec active:text-treeText p-1.5" aria-label="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 bg-treeBg">
        {loading && (
          <div className="h-full flex items-center justify-center text-treeTextSec">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
        {!loading && error && (
          <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm text-treeText">Couldn't load this CV.</p>
            <p className="text-xs text-treeTextSec">{error}</p>
          </div>
        )}
        {!loading && !error && cv && isPdf && (
          <iframe src={cv.blobUrl} title={`CV — ${talentName}`} className="w-full h-full border-0" />
        )}
        {!loading && !error && cv && !isPdf && (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
            <FileText size={32} className="text-treeTextSec" />
            <p className="text-sm text-treeText">This CV is a Word document.</p>
            <p className="text-xs text-treeTextSec max-w-xs">
              In-browser preview isn't supported for{' '}
              {cv.filename.split('.').pop()?.toUpperCase()} files. Download it to view.
            </p>
            <a
              href={cv.blobUrl}
              download={cv.filename}
              onClick={() => telemetry.capture('cv_downloaded', { role_id: roleId, talent_id: talentId })}
              className="flex items-center gap-1.5 text-sm font-semibold bg-primary text-white rounded-lg px-4 py-2 active:bg-primaryDark"
            >
              <Download size={16} />
              Download CV
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
