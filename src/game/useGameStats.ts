import { useMemo } from 'react'
import { useRoles } from '../hooks/useRoles'
import { computeGameStats, computeAchievements } from './gamification'
import type { GameStats, Achievement } from './gamification'

export function useGameStats(recruiterFilter: string): {
  stats: GameStats | null
  achievements: Achievement[]
  isLoading: boolean
} {
  const { data: roles, isLoading } = useRoles()

  const filtered = useMemo(
    () => (roles ?? []).filter((r) => !recruiterFilter || r.recruiter_email === recruiterFilter),
    [roles, recruiterFilter],
  )

  const stats = useMemo(() => {
    if (!roles) return null
    const rolesTotal   = filtered.length
    const rolesOpen    = filtered.filter((r) => r.status === 'open').length
    const matchesTotal = filtered.reduce((s, r) => s + r.counts.total, 0)
    const shortlisted  = filtered.reduce((s, r) => s + r.counts.shortlisted, 0)
    const intros       = filtered.reduce((s, r) => s + r.counts.introduced, 0)
    return computeGameStats(rolesTotal, rolesOpen, matchesTotal, shortlisted, intros)
  }, [filtered, roles])

  const achievements = useMemo(() => {
    if (!stats) return []
    return computeAchievements(stats.rolesTotal, stats.matchesTotal, stats.shortlisted, stats.intros)
  }, [stats])

  return { stats, achievements, isLoading }
}
