import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getShortlist, toggleShortlist } from '../lib/api'

export function useShortlist(roleId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery<string[]>({
    queryKey: ['shortlist', roleId],
    queryFn: () => getShortlist(roleId!),
    enabled: Boolean(roleId),
    staleTime: 60 * 1000,
  })

  const mutation = useMutation({
    mutationFn: (talentId: string) => toggleShortlist(roleId!, talentId),
    onMutate: async (talentId) => {
      await queryClient.cancelQueries({ queryKey: ['shortlist', roleId] })
      const prev = queryClient.getQueryData<string[]>(['shortlist', roleId]) ?? []
      const next = prev.includes(talentId)
        ? prev.filter((id) => id !== talentId)
        : [...prev, talentId]
      queryClient.setQueryData(['shortlist', roleId], next)
      return { prev }
    },
    onError: (_err, _talentId, ctx) => {
      if (ctx) queryClient.setQueryData(['shortlist', roleId], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist', roleId] })
    },
  })

  return {
    talentIds: new Set(query.data ?? []),
    isLoading: query.isLoading,
    toggle: (talentId: string) => {
      if (!roleId) return
      mutation.mutate(talentId)
    },
  }
}
