import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { MatchWithTalent } from '../types'

async function fetchMatches(roleId: string): Promise<MatchWithTalent[]> {
  const { data, error } = await supabase
    .from('_matches')
    .select(
      `*, talent:talent_id(
        id, name, location, city, country, rotation_preference, mobility_regions,
        availability_status, available_from, notice_period_days, rate, rate_type,
        currency, visa_status, work_rights, certifications, linkedin_url, headline,
        job_family, discipline, tl_band, regional_experience, asset_experience, industries
      ),
      cascade_run:cascade_run_id(run_direction)`
    )
    .eq('role_id', roleId)
    .order('match_score', { ascending: false })

  if (error) throw error
  return (data ?? []) as MatchWithTalent[]
}

export function useMatches(roleId: string | null) {
  return useQuery<MatchWithTalent[]>({
    queryKey: ['matches', roleId],
    queryFn: () => fetchMatches(roleId!),
    enabled: roleId !== null,
    staleTime: 60 * 1000,
  })
}
