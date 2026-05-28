import { useEffect } from 'react'
import { useRoles } from '../hooks/useRoles'
import { useMatches } from '../hooks/useMatches'
import { MatchCard } from './MatchCard'
import { telemetry } from '../lib/telemetry'
import type { RoleWithCounts } from '../types'

interface IntrosTabProps {
  recruiterFilter: string
}

// One role's worth of intro/shortlist cards, with a header.
function RoleIntros({ role }: { role: RoleWithCounts }) {
  const { data: matches } = useMatches(role.id)

  const intros = (matches ?? []).filter(
    (m) => m.status === 'introduced' || m.status === 'shortlisted',
  )

  if (!intros.length) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 pt-2">
        <p className="text-xs font-semibold text-treeText truncate">{role.title}</p>
        <span className="text-[10px] text-treeTextSec uppercase tracking-wider">
          {intros.length} candidate{intros.length === 1 ? '' : 's'}
        </span>
      </div>
      {intros.map((match) => (
        <MatchCard key={match.id} match={match} roleId={role.id} />
      ))}
    </div>
  )
}

export function IntrosTab({ recruiterFilter }: IntrosTabProps) {
  const { data: roles, isLoading } = useRoles()

  const recruiterRoles = (roles ?? []).filter(
    (r) => !recruiterFilter || r.recruiter_email === recruiterFilter,
  )

  const rolesWithIntros = recruiterRoles.filter(
    (r) => r.counts.introduced > 0 || r.counts.shortlisted > 0,
  )

  const totalIntroductions = recruiterRoles.reduce((s, r) => s + r.counts.introduced, 0)
  const totalShortlisted = recruiterRoles.reduce((s, r) => s + r.counts.shortlisted, 0)

  useEffect(() => {
    if (isLoading) return
    telemetry.capture('intros_tab_summary', {
      roles_with_intros: rolesWithIntros.length,
      total_shortlisted: totalShortlisted,
      total_introduced: totalIntroductions,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, rolesWithIntros.length])

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
    <div className="p-4 space-y-4">
      <div className="flex gap-3">
        <div className="flex-1 bg-treeSurface border border-treeBorder rounded-xl p-3 text-xs leading-relaxed">
          <span className="font-semibold text-treeText">Shortlisted</span>
          <span className="text-treeTextSec"> (</span>
          <span className="text-purple-300 font-medium">the user showed interest</span>
          <span className="text-treeTextSec">, or </span>
          <span className="text-pink-300 font-medium">the recruiter chose a candidate</span>
          <span className="text-treeTextSec">) &amp; </span>
          <span className="font-semibold text-blue-300">Introduced</span>
          <span className="text-treeTextSec"> (double opt-in approved, introduction made)</span>
        </div>
        <div className="flex-shrink-0 bg-treeSurface border border-treeBorder rounded-xl p-3 flex flex-col items-center justify-center min-w-[88px]">
          <span className="text-2xl font-bold text-blue-300 leading-none">
            {totalIntroductions}
          </span>
          <span className="text-[10px] text-treeTextSec uppercase tracking-wider mt-1.5 text-center">
            Introductions
          </span>
        </div>
      </div>
      {rolesWithIntros.map((role) => (
        <RoleIntros key={role.id} role={role} />
      ))}
    </div>
  )
}
