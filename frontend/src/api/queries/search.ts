import { useQuery } from '@tanstack/react-query'
import { client, unwrap } from '../client'
import type { SearchCategory } from '../types'

/**
 * The categories search takes, at runtime, to check a stored or
 * `/categories` id against.
 */
export const SEARCH_CATEGORIES = [
  'movie',
  'series',
  'game',
  'anime',
  'manga',
  'book',
] as const satisfies readonly SearchCategory[]

export function isSearchCategory(value: string): value is SearchCategory {
  return (SEARCH_CATEGORIES as readonly string[]).includes(value)
}

export interface SearchParams {
  category: SearchCategory
  q: string
}

const all = ['search'] as const

/**
 * Creating or updating a review should invalidate `all`: each result's
 * `my_review` changes with it.
 */
export const searchKeys = {
  all,
  list: (params: SearchParams) => [...all, params] as const,
}

interface UseSearchOptions {
  /** False holds the request back, such as until the query is long enough. */
  enabled?: boolean
}

/** A provider's matches for `q` in `category`. */
export function useSearch(
  params: SearchParams,
  { enabled = true }: UseSearchOptions = {},
) {
  return useQuery({
    queryKey: searchKeys.list(params),
    queryFn: async ({ signal }) => {
      const body = await unwrap(
        client.GET('/api/v3/search', { params: { query: params }, signal }),
      )
      return body.data
    },
    enabled,
    // A new `q` keeps the last results on screen while it loads; a new
    // category doesn't, so another category's results never show under it.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1].category === params.category
        ? previous
        : undefined,
    // The error state has its own "Try again", and each retry spends the
    // provider's quota.
    retry: false,
  })
}
