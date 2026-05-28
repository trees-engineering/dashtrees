import { useEffect } from 'react'
import { useRoles } from '../hooks/useRoles'
import { useMatches } from '../hooks/useMatches'
import { MatchCard } from './MatchCard'
import { RerunMatchesButton } from './RerunMatchesButton'
import { telemetry } from '../lib/telemetry'

interface MatchesTabProps {
  selectedRoleId: string | null
  onRoleChange: (id: string) => void
  recruiterFilter: string
}

export function MatchesTab({ selectedRoleId, onRoleChange, recruiterFilter }: MatchesTabProps) {
  const { data: roles, isLoading: rolesLoading } = useRoles()
  const { data: matches, isLoading: matchesLoading } = useMatches(selectedRoleId)

  const openRoles = (roles ?? []).filter(
    (r) =>
      r.status === 'open' && (!recruiterFilter || r.recruiter_email === recruiterFilter)
  )

  useEffect(() => {
    if (!selectedRoleId || matchesLoading) return
    telemetry.capture('matches_list_loaded', {
      role_id: selectedRoleId,
      match_count: matches?.length ?? 0,
      shortlisted: (matches ?? []).filter((m) => m.status === 'shortlisted').length,
      introduced: (matches ?? []).filter((m) => m.status === 'introduced').length,
    })
  }, [selectedRoleId, matchesLoading, matches?.length])

  return (
    <div className="p-4 space-y-4">
      {/* Role selector */}
      <div>
        <label className="block text-xs font-semibold text-treeTextSec uppercase tracking-wider mb-2">
          Select Role
        </label>
        {rolesLoading ? (
          <div className="h-12 bg-treeSurface border border-treeBorder rounded-xl animate-pulse" />
        ) : (
          <div className="flex gap-2">
            <select
              data-telemetry-id="matches-role-picker"
              value={selectedRoleId ?? ''}
              onChange={(e) => {
                telemetry.capture('matches_role_changed', {
                  from: selectedRoleId,
                  to: e.target.value || null,
                })
                onRoleChange(e.target.value)
              }}
              className="flex-1 h-12 px-4 rounded-xl border border-treeBorder bg-treeSurface text-treeText text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">— Choose a role —</option>
              {openRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                  {role.location_requirement ? ` · ${role.location_requirement}` : ''}
                </option>
              ))}
            </select>
            <RerunMatchesButton roleId={selectedRoleId} variant="compact" />
          </div>
        )}
      </div>

      {/* Match list */}
      {!selectedRoleId ? (
        <div className="text-center py-16 text-treeTextSec text-sm">
          <p className="text-3xl mb-3">🌲</p>
          <p>Select a role to view matches</p>
        </div>
      ) : matchesLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-treeSurface border border-treeBorder rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : !matches || matches.length === 0 ? (
        <div className="text-center py-12 text-treeTextSec text-sm">
          No matches for this role yet
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-treeTextSec">
            {matches.length} match{matches.length !== 1 ? 'es' : ''} found
          </p>
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              roleId={selectedRoleId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
