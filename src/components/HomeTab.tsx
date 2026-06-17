import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { StatCard } from './StatCard'
import { UploadJDButton } from './UploadJDButton'
import { TalkToTreelanceButton } from './TalkToTreelanceButton'
import { CvUploadButton } from './CvUploadButton'
import { useRoles } from '../hooks/useRoles'
import { formatDate, roleStatusBadgeClass } from '../lib/utils'
import { telemetry } from '../lib/telemetry'

interface HomeTabProps {
  onNavigate: (tab: string) => void
  onPostRole: () => void
  onAddCandidate: () => void
  recruiterFilter: string
}

function SkeletonCard() {
  return (
    <div className="bg-treeSurface rounded-xl border border-treeBorder p-4 animate-pulse min-h-[80px]">
      <div className="h-8 bg-treeBorderLight rounded w-16 mx-auto mb-2" />
      <div className="h-3 bg-treeBorderLight rounded w-20 mx-auto" />
    </div>
  )
}

export function HomeTab({ onNavigate, onPostRole, onAddCandidate, recruiterFilter }: HomeTabProps) {
  const { data: roles, isLoading: rolesLoading, error: rolesError } = useRoles()

  const filteredRoles = (roles ?? []).filter(
    (r) => !recruiterFilter || r.recruiter_email === recruiterFilter
  )

  const stats = roles
    ? {
        roles_open: filteredRoles.filter((r) => r.status === 'open').length,
        roles_total: filteredRoles.length,
        matches_total: filteredRoles.reduce((sum, r) => sum + r.counts.total, 0),
        intros: filteredRoles.reduce((sum, r) => sum + r.counts.introduced, 0),
      }
    : null

  const recentRoles = filteredRoles.slice(0, 5)

  useEffect(() => {
    if (rolesLoading || !stats) return
    telemetry.capture('home_stats_viewed', {
      roles_open: stats.roles_open,
      roles_total: stats.roles_total,
      matches_total: stats.matches_total,
      intros: stats.intros,
    })
  }, [rolesLoading, stats?.roles_open, stats?.roles_total, stats?.matches_total, stats?.intros])

  const error = rolesError
  if (error) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-red-600 font-semibold text-sm">Supabase connection failed</p>
        <p className="text-treeTextSec text-xs font-mono break-all">
          {(error as Error).message}
        </p>
        <p className="text-treeTextSec text-xs mt-2">
          Check your VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env, and open the browser console for full details.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Stats grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider">
            Overview
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
        <div className="grid grid-cols-2 gap-3">
          {rolesLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              <StatCard value={stats?.roles_open ?? 0} label="Open Roles" />
              <StatCard value={stats?.matches_total ?? 0} label="Total Matches" />
              <StatCard value={stats?.intros ?? 0} label="Introductions" />
              <StatCard value={stats?.roles_total ?? 0} label="Total Roles" />
            </>
          )}
        </div>
      </div>

      {/* Recent roles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-treeTextSec uppercase tracking-wider">
            Recent Roles
          </h2>
          <button
            data-telemetry-id="home-view-all-roles"
            onClick={() => {
              telemetry.capture('home_view_all_clicked', { destination: 'roles' })
              onNavigate('roles')
            }}
            className="text-xs text-primary font-medium flex items-center gap-0.5"
          >
            View all <ChevronRight size={14} />
          </button>
        </div>

        <div className="bg-treeSurface rounded-xl border border-treeBorder overflow-hidden shadow-sm">
          {rolesLoading ? (
            <div className="divide-y divide-treeBorderLight">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 animate-pulse">
                  <div className="h-4 bg-treeBorderLight rounded w-3/4 mb-2" />
                  <div className="h-3 bg-treeBorderLight rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : recentRoles.length === 0 ? (
            <div className="p-6 text-center text-treeTextSec text-sm">
              No roles yet
            </div>
          ) : (
            <div className="divide-y divide-treeBorderLight">
              {recentRoles.map((role) => (
                <button
                  key={role.id}
                  data-telemetry-id="home-recent-role"
                  onClick={() => {
                    telemetry.capture('home_recent_role_clicked', {
                      role_id: role.id,
                      status: role.status,
                    })
                    onNavigate('roles')
                  }}
                  className="w-full text-left p-4 flex items-center justify-between active:bg-treeBg transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-treeText truncate">{role.title}</p>
                    <p className="text-xs text-treeTextSec mt-0.5">
                      {role.location_requirement ?? 'Remote'} · {formatDate(role.created_at)}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border ${roleStatusBadgeClass(role.status)}`}
                    >
                      {role.status}
                    </span>
                    <ChevronRight size={16} className="text-treeTextSec" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
