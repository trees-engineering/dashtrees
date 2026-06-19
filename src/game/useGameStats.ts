import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRoles } from '../hooks/useRoles'
import { getShortlistCount } from '../lib/api'
import { computeGameStats, computeAchievements } from './gamification'
import type { GameStats, Achievement } from './gamification'

export function useGameStats(recruiterFilter: string): {
  stats: GameStats | null
  achievements: Achievement[]
  isLoading: boolean
} {
  const { data: roles, isLoading: rolesLoading } = useRoles()

  // Real shortlist count from the _shortlists table (recruiter's actual tick-box activity).
  // Replaces the old _matches.status = 'shortlisted' count which the AI pipeline set
  // and which recruiters had no direct way to influence through the UI.
  const { data: shortlistCount = 0, isLoading: shortlistLoading } = useQuery<number>({
    queryKey: ['shortlistCount'],
    queryFn: getShortlistCount,
    staleTime: 30 * 1000,
  })

  const filtered = useMemo(
    () => (roles ?? []).filter((r) => !recruiterFilter || r.recruiter_email === recruiterFilter),
    [roles, recruiterFilter],
  )

  const stats = useMemo(() => {
    if (!roles) return null
    const rolesTotal   = filtered.length
    const rolesOpen    = filtered.filter((r) => r.status === 'open').length
    const matchesTotal = filtered.reduce((s, r) => s + r.counts.total, 0)
    const intros       = filtered.reduce((s, r) => s + r.counts.introduced, 0)
    return computeGameStats(rolesTotal, rolesOpen, matchesTotal, shortlistCount, intros)
  }, [filtered, roles, shortlistCount])

  const achievements = useMemo(() => {
    if (!stats) return []
    return computeAchievements(stats.rolesTotal, stats.matchesTotal, stats.shortlisted, stats.intros)
  }, [stats])

  return { stats, achievements, isLoading: rolesLoading || shortlistLoading }
}
