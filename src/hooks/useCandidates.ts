import { useQuery } from '@tanstack/react-query'
import { getCandidatesList, type CandidateListItem } from '../lib/api'

export function useCandidates() {
  return useQuery<CandidateListItem[]>({
    queryKey: ['candidates-list'],
    queryFn: getCandidatesList,
    staleTime: 2 * 60 * 1000,
  })
}
