import { useState } from 'react'
import { ChevronDown, ChevronUp, Users } from 'lucide-react'
import { useRoles } from '../hooks/useRoles'
import { formatDate, formatBudget } from '../lib/utils'
import { UploadJDButton } from './UploadJDButton'
import { RerunMatchesButton } from './RerunMatchesButton'
import type { RoleWithCounts } from '../types'

type StatusFilter = 'open' | 'all' | 'closed'

interface RolesTabProps {
  onViewMatches: (roleId: string) => void
  recruiterFilter: string
}

function RoleAccordion({
  role,
  onViewMatches,
}: {
  role: RoleWithCounts
  onViewMatches: (roleId: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-treeBorder rounded-xl overflow-hidden bg-treeSurface shadow-sm">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-4 flex items-start gap-3 active:bg-treeBg transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-treeText text-sm leading-snug">{role.title}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                role.status === 'open'
                  ? 'bg-green-100 text-green-800 border-green-200'
                  : role.status === 'closed'
                  ? 'bg-red-100 text-red-800 border-red-200'
                  : 'bg-gray-100 text-gray-700 border-gray-200'
              }`}
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
              onClick={() => onViewMatches(role.id)}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-medium active:bg-primaryDark transition-colors"
            >
              View Matches ({role.counts.total})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function RolesTab({ onViewMatches, recruiterFilter }: RolesTabProps) {
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
        <UploadJDButton />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {(['open', 'all', 'closed'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
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
            <RoleAccordion key={role.id} role={role} onViewMatches={onViewMatches} />
          ))}
        </div>
      )}
    </div>
  )
}
