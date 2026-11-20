import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { client, unwrap } from '../client'
import type { paths } from '../schema'
import type { WatchlistPage } from '../types'

export const WATCHLIST_PAGE_SIZE = 20

/** The list filters. Paging is the query's job. */
export type WatchlistListParams = Omit<
  NonNullable<paths['/api/v3/watchlist']['get']['parameters']['query']>,
  'limit' | 'offset'
>

const all = ['watchlist'] as const
const lists = () => [...all, 'list'] as const

/**
 * The facets sit under `all`, not `lists()`, so a mutation that changes the
 * watchlist should invalidate `all` to refresh the counts too.
 */
export const watchlistKeys = {
  all,
  lists,
  list: (params: WatchlistListParams) => [...lists(), params] as const,
  facets: () => [...all, 'facets'] as const,
}

function nextOffset(last: WatchlistPage) {
  // An empty page means entries were removed while scrolling. Stop there
  // rather than ask for the same offset forever.
  if (last.data.length === 0) return undefined
  const { count, offset } = last.meta.pagination
  const next = offset + last.data.length
  return next < count ? next : undefined
}

/** Pages of the watchlist, newest first, with the count in each `meta`. */
export function useWatchlist(params: WatchlistListParams) {
  return useInfiniteQuery({
    queryKey: watchlistKeys.list(params),
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        client.GET('/api/v3/watchlist', {
          params: {
            query: { ...params, limit: WATCHLIST_PAGE_SIZE, offset: pageParam },
          },
          signal,
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    // Keeps the last category's entries on screen while the next one loads.
    placeholderData: keepPreviousData,
  })
}

/** The total and the count per category, for the chips. */
export function useWatchlistFacets() {
  return useQuery({
    queryKey: watchlistKeys.facets(),
    queryFn: async ({ signal }) => {
      const body = await unwrap(
        client.GET('/api/v3/watchlist/facets', { signal }),
      )
      return body.data
    },
  })
}
