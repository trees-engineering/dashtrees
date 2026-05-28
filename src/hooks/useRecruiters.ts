import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Recruiter } from '../types'

async function fetchRecruiters(): Promise<Recruiter[]> {
  const { data, error } = await supabase
    .from('_recruiters')
    .select('id, email, name, company, verified, is_admin')
    .order('email', { ascending: true })

  if (error) throw error
  return data ?? []
}

// Powers the admin dropdown. Non-admins never see the dropdown, so we skip
// the fetch entirely for them — no point leaking the full recruiter list
// into a non-admin's browser even if they could query it themselves.
export function useRecruiters() {
  const { isAdmin } = useAuth()
  return useQuery<Recruiter[]>({
    queryKey: ['recruiters'],
    queryFn: fetchRecruiters,
    staleTime: 10 * 60 * 1000,
    enabled: isAdmin,
  })
}
