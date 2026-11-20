import { useQuery } from '@tanstack/react-query'
import { client, unwrap } from '../client'

const all = ['items'] as const

export const itemKeys = {
  all,
  detail: (id: string) => [...all, id] as const,
}

interface UseItemOptions {
  enabled?: boolean
}

/**
 * One stored item, by its id. A 404 fails at once: the default retry skips
 * 4xx responses.
 */
export function useItem(id: string, { enabled = true }: UseItemOptions = {}) {
  return useQuery({
    queryKey: itemKeys.detail(id),
    queryFn: async ({ signal }) => {
      const body = await unwrap(
        client.GET('/api/v3/items/{item_id}', {
          params: { path: { item_id: id } },
          signal,
        }),
      )
      return body.data
    },
    enabled,
  })
}
