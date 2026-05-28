import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { RoleWithCounts } from '../types'

// Supabase/PostgREST caps a single response at 1000 rows. Page through
// with .range() until a short page is returned so nothing is silently dropped.
const PAGE_SIZE = 1000

async function fetchAllRoles(recruiterId: string | null) {
  const all: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('_role')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    // Non-admins: scope at the query level so the browser literally never
    // sees other recruiters' rows. Admins (recruiterId === null) get every
    // role.
    if (recruiterId) query = query.eq('created_by', recruiterId)
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return all
}

async function fetchAllMatches(roleIds: string[]) {
  const all: { role_id: string; status: string | null }[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('_matches')
      .select('role_id, status')
      .in('role_id', roleIds)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return all
}

async function fetchRoles(recruiterId: string | null): Promise<RoleWithCounts[]> {
  // Step 1: Fetch roles (scoped for non-admins, all for admins).
  const roles = await fetchAllRoles(recruiterId)
  if (roles.length === 0) return []

  const roleIds = roles.map((r) => r.id)
  const createdByIds = [...new Set(roles.map((r) => r.created_by).filter(Boolean))] as string[]

  // Step 2: Fetch match counts (scoped to the visible role set) in parallel
  // with recruiter emails for the join.
  const [matches, recruitersRes] = await Promise.all([
    fetchAllMatches(roleIds),
    createdByIds.length > 0
      ? supabase
          .from('_recruiters')
          .select('id, email')
          .in('id', createdByIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (recruitersRes.error) throw recruitersRes.error

  const recruiters = recruitersRes.data ?? []

  // Build lookup maps
  const recruiterMap = new Map(recruiters.map((r) => [r.id, r.email]))

  // Count every match, including screened-out ones — recruiters need to see
  // poorly-ranked candidates and may disagree with the pipeline's screening.
  const countMap = new Map<string, { total: number; shortlisted: number; introduced: number }>()
  for (const m of matches) {
    const existing = countMap.get(m.role_id) ?? { total: 0, shortlisted: 0, introduced: 0 }
    existing.total++
    if (m.status === 'shortlisted') existing.shortlisted++
    if (m.status === 'introduced') existing.introduced++
    countMap.set(m.role_id, existing)
  }

  return roles.map((role) => ({
    ...role,
    recruiter_email: role.created_by ? (recruiterMap.get(role.created_by) ?? null) : null,
    counts: countMap.get(role.id) ?? { total: 0, shortlisted: 0, introduced: 0 },
  }))
}

export function useRoles() {
  const { isAdmin, recruiter } = useAuth()
  // Admins see everything → recruiterId = null (no filter).
  // Non-admins are scoped to their own recruiter id.
  const recruiterId = isAdmin ? null : recruiter?.id ?? null

  return useQuery<RoleWithCounts[]>({
    // The cache key includes the scope so an admin → non-admin transition
    // (same browser, different user) doesn't reuse stale data.
    queryKey: ['roles', recruiterId ?? 'all'],
    queryFn: () => fetchRoles(recruiterId),
    staleTime: 2 * 60 * 1000,
    // Don't fire until we know who they are: admins can run with null,
    // non-admins need their recruiter id.
    enabled: isAdmin || !!recruiterId,
  })
}
