import { useQuery } from '@tanstack/react-query'
import { client, unwrap } from '../client'

export const categoryKeys = {
  all: ['categories'] as const,
}

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: async ({ signal }) => {
      const body = await unwrap(client.GET('/api/v3/categories', { signal }))
      return body.data
    },
    // The list only changes with a deploy, so keep it for the session.
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
