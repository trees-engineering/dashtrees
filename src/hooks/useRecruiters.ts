import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Recruiter } from '../types'

async function fetchRecruiters(): Promise<Recruiter[]> {
  const { data, error } = await supabase
    .from('_recruiters')
    .select('id, email, name, company, verified')
    .order('email', { ascending: true })

  if (error) throw error
  return data ?? []
}

export function useRecruiters() {
  return useQuery<Recruiter[]>({
    queryKey: ['recruiters'],
    queryFn: fetchRecruiters,
    staleTime: 10 * 60 * 1000,
  })
}
