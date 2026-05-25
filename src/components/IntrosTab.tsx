import { useRoles } from '../hooks/useRoles'
import { useMatches } from '../hooks/useMatches'
import { scoreColor, scoreBg, statusBadgeClass, availBadgeClass } from '../lib/utils'
import type { RoleWithCounts, MatchWithTalent } from '../types'

interface IntrosTabProps {
  recruiterFilter: string
}

function IntroCard({
  match,
  role,
}: {
  match: MatchWithTalent
  role: RoleWithCounts
}) {
  const score = match.match_score ?? 0
  return (
    <div className="bg-treeSurface border border-treeBorder rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-3">
        {/* Score badge */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{ backgroundColor: scoreBg(score), color: scoreColor(score) }}
        >
          {score}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-treeText text-sm truncate">
            {match.talent?.name ?? 'Unknown'}
          </p>
          <p className="text-xs text-treeTextSec truncate mt-0.5">{role.title}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusBadgeClass(match.status)}`}
            >
              {match.status}
            </span>
            {match.talent?.availability_status && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium border ${availBadgeClass(match.talent.availability_status)}`}
              >
                {match.talent.availability_status === 'yes'
                  ? 'Available'
                  : match.talent.availability_status === 'maybe'
                  ? 'Maybe'
                  : 'Unavailable'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Sub-component that loads matches for a single role
function RoleIntros({
  role,
}: {
  role: RoleWithCounts
}) {
  const { data: matches } = useMatches(role.id)

  const intros = (matches ?? []).filter(
    (m) => m.status === 'introduced' || m.status === 'shortlisted'
  )

  if (!intros.length) return null

  return (
    <>
      {intros.map((match) => (
        <IntroCard key={match.id} match={match} role={role} />
      ))}
    </>
  )
}

export function IntrosTab({ recruiterFilter }: IntrosTabProps) {
  const { data: roles, isLoading } = useRoles()

  const recruiterRoles = (roles ?? []).filter(
    (r) => !recruiterFilter || r.recruiter_email === recruiterFilter
  )

  // Only load matches for roles that have intros
  const rolesWithIntros = recruiterRoles.filter((r) => r.counts.introduced > 0 || r.counts.shortlisted > 0)

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-20 bg-treeSurface border border-treeBorder rounded-xl animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (rolesWithIntros.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-treeText font-medium mb-1">No introductions yet</p>
        <p className="text-treeTextSec text-sm">
          Shortlisted and introduced candidates will appear here
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-treeTextSec uppercase tracking-wider font-semibold">
        Shortlisted & Introduced
      </p>
      {rolesWithIntros.map((role) => (
        <RoleIntros key={role.id} role={role} />
      ))}
    </div>
  )
}
