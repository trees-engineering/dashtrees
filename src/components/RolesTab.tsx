import { useState } from 'react'
import { ChevronDown, ChevronUp, Users, Loader2, XCircle, Pencil } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRoles } from '../hooks/useRoles'
import { formatDate, formatBudget, roleStatusBadgeClass } from '../lib/utils'
import { UploadJDButton } from './UploadJDButton'
import { TalkToTreelanceButton } from './TalkToTreelanceButton'
import { CvUploadButton } from './CvUploadButton'
import { RerunMatchesButton } from './RerunMatchesButton'
import { useToast } from './Toast'
import { updateRoleStatus } from '../lib/api'
import { telemetry } from '../lib/telemetry'
import type { RoleWithCounts } from '../types'

type StatusFilter = 'open' | 'all' | 'closed'

interface RolesTabProps {
  onViewMatches: (roleId: string) => void
  onEditRole: (roleId: string) => void
  onPostRole: () => void
  onAddCandidate: () => void
  recruiterFilter: string
}

function RoleAccordion({
  role,
  onViewMatches,
  onEditRole,
}: {
  role: RoleWithCounts
  onViewMatches: (roleId: string) => void
  onEditRole: (roleId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [showFull, setShowFull] = useState(false)
  const [closing, setClosing] = useState(false)
  const toast = useToast()
  const queryClient = useQueryClient()

  async function handleCloseJob(e: React.MouseEvent) {
    e.stopPropagation()
    if (closing) return
    const confirmed = window.confirm(
      `Close "${role.title}"? Existing matches stay visible, but the role will be marked closed and no new matches will be scored.`,
    )
    if (!confirmed) {
      telemetry.capture('role_close_cancelled', { role_id: role.id })
      return
    }
    setClosing(true)
    telemetry.capture('role_close_confirmed', { role_id: role.id })
    const toastId = toast.show('loading', `Closing "${role.title}"…`)
    try {
      await telemetry.timed('role_close', () => updateRoleStatus(role.id, 'closed'), {
        props: { role_id: role.id },
      })
      telemetry.capture('role_closed_manually', { role_id: role.id })
      toast.update(toastId, 'success', `Role "${role.title}" closed.`)
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    } catch (err) {
      toast.update(toastId, 'error', `Couldn't close role: ${(err as Error).message}`)
    } finally {
      setClosing(false)
    }
  }

  return (
    <div className="border border-treeBorder rounded-xl overflow-hidden bg-treeSurface shadow-sm">
      {/* Header */}
      <button
        data-telemetry-id="role-accordion-toggle"
        onClick={() => {
          setOpen((o) => {
            const next = !o
            telemetry.capture('role_accordion_toggled', {
              role_id: role.id,
              opened: next,
              status: role.status,
            })
            return next
          })
        }}
        className="w-full text-left p-4 flex items-start gap-3 active:bg-treeBg transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-treeText text-sm leading-snug">{role.title}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium border ${roleStatusBadgeClass(role.status)}`}
            >
              {role.status}
            </span>
          </div>
          <p className="text-xs text-treeTextSec mt-1">
            {role.location_requirement ?? 'Location TBD'}
            {role.salary_min || role.salary_max
              ? ` · ${formatBudget(role.salary_min, role.salary_max, role.budget_currency)}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          {role.counts.total > 0 && (
            <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              <Users size={11} />
              {role.counts.total}
            </span>
          )}
          {open ? (
            <ChevronUp size={18} className="text-treeTextSec" />
          ) : (
            <ChevronDown size={18} className="text-treeTextSec" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-treeBorderLight px-4 pb-4 pt-3 space-y-3">
          {role.description && (
            <p className="text-sm text-treeTextSec leading-relaxed line-clamp-4">
              {role.description}
            </p>
          )}

          {role.detailed_description && (
            <div>
              <button
                data-telemetry-id="role-toggle-full-description"
                onClick={() => setShowFull((s) => !s)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primaryDark transition-colors"
              >
                {showFull ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {showFull ? 'Hide full description' : 'Full description'}
              </button>
              {showFull && (
                <p className="mt-2 text-xs text-treeTextSec leading-relaxed whitespace-pre-wrap">
                  {role.detailed_description}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            {role.start_deadline && (
              <div>
                <span className="text-treeTextSec">Start by</span>
                <p className="font-medium text-treeText">{formatDate(role.start_deadline)}</p>
              </div>
            )}
            {role.provides_sponsorship !== null && (
              <div>
                <span className="text-treeTextSec">Sponsorship</span>
                <p className="font-medium text-treeText">
                  {role.provides_sponsorship ? 'Yes' : 'No'}
                </p>
              </div>
            )}
            {role.recruiter_email && (
              <div className="col-span-2">
                <span className="text-treeTextSec">Recruiter</span>
                <p className="font-medium text-treeText truncate">{role.recruiter_email}</p>
              </div>
            )}
          </div>

          {role.counts.total > 0 && (
            <div className="flex gap-3 text-xs">
              <span className="text-treeTextSec">
                Shortlisted:{' '}
                <strong className="text-treeText">{role.counts.shortlisted}</strong>
              </span>
              <span className="text-treeTextSec">
                Introduced:{' '}
                <strong className="text-treeText">{role.counts.introduced}</strong>
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <RerunMatchesButton roleId={role.id} variant="full" />
            <button
              data-telemetry-id="role-view-matches"
              onClick={() => onViewMatches(role.id)}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold active:bg-primaryDark transition-colors"
            >
              View Matches ({role.counts.total})
            </button>
          </div>

          <div className="flex gap-2">
            <button
              data-telemetry-id="role-edit"
              onClick={(e) => {
                e.stopPropagation()
                telemetry.capture('role_edit_clicked', { role_id: role.id, status: role.status })
                onEditRole(role.id)
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-treeBorder text-treeText text-sm font-medium active:bg-treeBg transition-colors"
            >
              <Pencil size={14} /> Edit
            </button>
            {role.status === 'open' && (
              <button
                data-telemetry-id="role-close-job"
                onClick={handleCloseJob}
                disabled={closing}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-red-300 text-red-600 text-sm font-medium active:bg-red-50 transition-colors disabled:opacity-50"
              >
                {closing ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                {closing ? 'Closing…' : 'Close Job'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function RolesTab({ onViewMatches, onEditRole, onPostRole, onAddCandidate, recruiterFilter }: RolesTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const { data: roles, isLoading } = useRoles()

  const filtered = (roles ?? [])
    .filter((r) => !recruiterFilter || r.recruiter_email === recruiterFilter)
    .filter((r) => {
      if (statusFilter === 'open') return r.status === 'open'
      if (statusFilter === 'closed') return r.status === 'closed'
      return true
    })

  const allFiltered = (roles ?? []).filter(
    (r) => !recruiterFilter || r.recruiter_email === recruiterFilter
  )
  const counts = {
    open: allFiltered.filter((r) => r.status === 'open').length,
    all: allFiltered.length,
    closed: allFiltered.filter((r) => r.status === 'closed').length,
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider">
          Roles
        </h2>
        <div className="flex items-center gap-2">
          <TalkToTreelanceButton />
          <CvUploadButton onAddCandidate={onAddCandidate} />
          <UploadJDButton
            recruiterFilter={recruiterFilter}
            onPostRole={onPostRole}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {(['open', 'all', 'closed'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            data-telemetry-id={`roles-filter-${s}`}
            onClick={() => {
              if (s !== statusFilter) {
                telemetry.capture('roles_filter_changed', { from: statusFilter, to: s })
              }
              setStatusFilter(s)
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-primary text-white border-primary'
                : 'bg-treeSurface text-treeText border-treeBorder'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}{' '}
            <span className="opacity-75">({counts[s]})</span>
          </button>
        ))}
      </div>

      {/* Role list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-treeSurface border border-treeBorder rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-treeTextSec text-sm">
          No {statusFilter !== 'all' ? statusFilter : ''} roles found
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((role) => (
            <RoleAccordion
              key={role.id}
              role={role}
              onViewMatches={onViewMatches}
              onEditRole={onEditRole}
            />
          ))}
        </div>
      )}
    </div>
  )
}
