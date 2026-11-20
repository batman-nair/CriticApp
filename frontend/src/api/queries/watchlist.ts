import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { client, unwrap } from '../client'
import type { paths } from '../schema'
import type {
  SearchResult,
  WatchlistEntryCreate,
  WatchlistPage,
} from '../types'
import { searchKeys } from './search'

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

/**
 * Puts a title on the watchlist; one already there comes back as it is. The
 * list, chips and header count refetch. Search results aren't refetched:
 * the cached ones with this title say `on_watchlist`, the rest go stale.
 *
 * Call `mutateAsync` once per title when several can be in flight: TanStack
 * only runs `mutate`'s own callbacks for the last of overlapping calls.
 */
export function useAddToWatchlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entry: WatchlistEntryCreate) => {
      const body = await unwrap(
        client.POST('/api/v3/watchlist', { body: entry }),
      )
      return body.data
    },
    onSuccess: (entry, { item_id }) => {
      // Not awaited, so the add doesn't wait for the refetch.
      void queryClient.invalidateQueries({ queryKey: watchlistKeys.all })
      // Every search goes stale first, without a refetch. Writing the patched
      // ones afterwards makes them fresh again, the one on screen included;
      // the other way round would leave it stale, to refetch on focus.
      void queryClient.invalidateQueries({
        queryKey: searchKeys.all,
        refetchType: 'none',
      })
      // The request's id can be an alias of the stored one.
      const ids = new Set([item_id, entry.item.id])
      queryClient.setQueriesData<SearchResult[]>(
        { queryKey: searchKeys.all },
        (results) => {
          if (!results?.some((result) => ids.has(result.id))) return undefined
          return results.map((result) =>
            ids.has(result.id) ? { ...result, on_watchlist: true } : result,
          )
        },
      )
    },
  })
}
