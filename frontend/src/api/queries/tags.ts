import { useQuery } from '@tanstack/react-query'
import { client, unwrap } from '../client'

const all = ['tags'] as const

export const tagKeys = {
  all,
  list: () => [...all, 'list'] as const,
}

interface UseTagsOptions {
  /** False holds the request back, such as until the form that needs it opens. */
  enabled?: boolean
}

/** The logged-in user's most-used tags, most used first. */
export function useTags({ enabled = true }: UseTagsOptions = {}) {
  return useQuery({
    queryKey: tagKeys.list(),
    queryFn: async ({ signal }) => {
      // No params: the server counts the logged-in user's tags, 10 of them.
      const body = await unwrap(client.GET('/api/v3/tags', { signal }))
      return body.data
    },
    enabled,
  })
}
