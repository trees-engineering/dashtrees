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
  trackerTalentIds: Set<string>
  onTrackerToggle: (talentId: string, roleId: string) => void
}

export function MatchesTab({ selectedRoleId, onRoleChange, recruiterFilter, trackerTalentIds, onTrackerToggle }: MatchesTabProps) {
  const { data: roles, isLoading: rolesLoading } = useRoles()
  const { data: matches, isLoading: matchesLoading } = useMatches(selectedRoleId)

  const visibleRoles = (roles ?? []).filter(
    (r) => !recruiterFilter || r.recruiter_email === recruiterFilter,
  )
  const openRoles = visibleRoles.filter((r) => r.status === 'open')
  const closedRoles = visibleRoles.filter((r) => r.status === 'closed')

  // Each dropdown reflects the current selection only if the selected role
  // matches that dropdown's status. Picking from one naturally clears the
  // other because its option set doesn't include the new id.
  const selectedRole = visibleRoles.find((r) => r.id === selectedRoleId)
  const selectedOpenId = selectedRole?.status === 'open' ? selectedRoleId ?? '' : ''
  const selectedClosedId = selectedRole?.status === 'closed' ? selectedRoleId ?? '' : ''

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
              data-telemetry-id="matches-role-picker-open"
              value={selectedOpenId}
              onChange={(e) => {
                telemetry.capture('matches_role_changed', {
                  from: selectedRoleId,
                  to: e.target.value || null,
                  status_picked: e.target.value ? 'open' : null,
                })
                onRoleChange(e.target.value)
              }}
              className="flex-1 min-w-0 h-12 px-4 rounded-xl border border-treeBorder bg-treeSurface text-treeText text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">— Open role —</option>
              {openRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                  {role.location_requirement ? ` · ${role.location_requirement}` : ''}
                </option>
              ))}
            </select>
            <select
              data-telemetry-id="matches-role-picker-closed"
              value={selectedClosedId}
              onChange={(e) => {
                telemetry.capture('matches_role_changed', {
                  from: selectedRoleId,
                  to: e.target.value || null,
                  status_picked: e.target.value ? 'closed' : null,
                })
                onRoleChange(e.target.value)
              }}
              disabled={closedRoles.length === 0}
              className="flex-1 min-w-0 h-12 px-4 rounded-xl border border-treeBorder bg-treeSurface2 text-treeText text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
              title={closedRoles.length === 0 ? 'No closed roles' : undefined}
            >
              <option value="">— Closed role —</option>
              {closedRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  [Closed] {role.title}
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
            {selectedRoleId && trackerTalentIds.size > 0 && (
              <span className="ml-2 text-primary font-medium">
                {matches.filter(m => trackerTalentIds.has(m.talent_id)).length} selected
              </span>
            )}
          </p>
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              roleId={selectedRoleId}
              selected={trackerTalentIds.has(match.talent_id)}
              onSelect={selectedRoleId ? () => onTrackerToggle(match.talent_id, selectedRoleId) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
