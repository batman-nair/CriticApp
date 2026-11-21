import {
  keepPreviousData,
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { ApiError, client, unwrap } from '../client'
import type { paths } from '../schema'
import type {
  SearchResult,
  WatchlistEntry,
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

/** The filters the counts take. */
export type WatchlistFacetsParams = NonNullable<
  paths['/api/v3/watchlist/facets']['get']['parameters']['query']
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
  allFacets: () => [...all, 'facets'] as const,
  facets: (params: WatchlistFacetsParams) =>
    [...all, 'facets', params] as const,
}

function nextOffset(last: WatchlistPage) {
  // An empty page means entries were removed while scrolling. Stop there
  // rather than ask for the same offset forever.
  if (last.data.length === 0) return undefined
  const { count, offset } = last.meta.pagination
  const next = offset + last.data.length
  return next < count ? next : undefined
}

/** Pages of the watchlist, in the params' sort, with the count in each `meta`. */
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

/**
 * The total and the counts per category and language, for the chips and the
 * menu. Without params, the whole watchlist's: the header tab and the page's
 * hero share that key.
 */
export function useWatchlistFacets(params: WatchlistFacetsParams = {}) {
  return useQuery({
    queryKey: watchlistKeys.facets(params),
    queryFn: async ({ signal }) => {
      const body = await unwrap(
        client.GET('/api/v3/watchlist/facets', {
          params: { query: params },
          signal,
        }),
      )
      return body.data
    },
    // Keeps the last counts while the next filter's counts load.
    placeholderData: keepPreviousData,
  })
}

/** Removes, so a refetch can wait for them all. */
const removeKey = [...all, 'remove'] as const

/**
 * Sets `on_watchlist` on the cached search results with one of `ids`,
 * without a refetch. Every search goes stale first; writing the patched ones
 * afterwards makes them fresh again, the one on screen included. The other
 * way round would leave it stale, to refetch on focus.
 */
function markOnWatchlist(
  queryClient: QueryClient,
  ids: ReadonlySet<string>,
  onWatchlist: boolean,
) {
  void queryClient.invalidateQueries({
    queryKey: searchKeys.all,
    refetchType: 'none',
  })
  queryClient.setQueriesData<SearchResult[]>(
    { queryKey: searchKeys.all },
    (results) => {
      if (!results?.some((result) => ids.has(result.id))) return undefined
      return results.map((result) =>
        ids.has(result.id) ? { ...result, on_watchlist: onWatchlist } : result,
      )
    },
  )
}

/**
 * Puts a title on the watchlist; one already there comes back as it is. The
 * list, chips and header count refetch, once no remove is in flight. Search
 * results aren't refetched: the cached ones with this title say
 * `on_watchlist`, the rest go stale.
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
      // A remove in flight refetches when it settles. Refetching now would
      // bring its card back until then.
      if (queryClient.isMutating({ mutationKey: removeKey }) === 0) {
        // Not awaited, so the add doesn't wait for the refetch.
        void queryClient.invalidateQueries({ queryKey: watchlistKeys.all })
      }
      // The request's id can be an alias of the stored one.
      markOnWatchlist(queryClient, new Set([item_id, entry.item.id]), true)
    },
  })
}

type WatchlistData = InfiniteData<WatchlistPage>

/** Where a removed entry was in one cached list. */
interface RemovedFrom {
  queryKey: QueryKey
  page: number
  index: number
  entry: WatchlistEntry
}

/**
 * Takes a title off the watchlist. One already gone (404) counts as removed.
 *
 * The card leaves every cached list at once, and goes back to its place if
 * the remove fails. The list, chips and header count refetch once the last
 * remove in flight has settled, so an earlier one can't bring a later card
 * back. The cached search results with this title no longer say
 * `on_watchlist`.
 *
 * Call `mutateAsync` once per title: TanStack only runs `mutate`'s own
 * callbacks for the last of overlapping calls.
 */
export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: removeKey,
    mutationFn: async (itemId: string) => {
      try {
        await unwrap(
          client.DELETE('/api/v3/watchlist/{item_id}', {
            params: { path: { item_id: itemId } },
          }),
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return
        throw error
      }
    },
    onMutate: async (itemId) => {
      // So a refetch already under way can't paint the card back. Not a
      // first load: cancelled, it would wait with nothing until the refetch.
      await queryClient.cancelQueries({
        queryKey: watchlistKeys.lists(),
        predicate: (query) => query.state.data !== undefined,
      })
      const removedFrom: RemovedFrom[] = []
      for (const [queryKey, data] of queryClient.getQueriesData<WatchlistData>({
        queryKey: watchlistKeys.lists(),
      })) {
        data?.pages.forEach((page, pageIndex) => {
          const index = page.data.findIndex((e) => e.item.id === itemId)
          if (index === -1) return
          removedFrom.push({
            queryKey,
            page: pageIndex,
            index,
            entry: page.data[index]!,
          })
          queryClient.setQueryData<WatchlistData>(
            queryKey,
            (current) =>
              current && {
                ...current,
                pages: current.pages.map((p, i) =>
                  i === pageIndex
                    ? { ...p, data: p.data.filter((e) => e.item.id !== itemId) }
                    : p,
                ),
              },
          )
        })
      }
      return { removedFrom }
    },
    onError: (_error, _itemId, context) => {
      // Back where it was, and only it: another remove may be in flight.
      for (const { queryKey, page, index, entry } of context?.removedFrom ??
        []) {
        queryClient.setQueryData<WatchlistData>(queryKey, (current) => {
          if (
            !current?.pages[page] ||
            current.pages.some((p) =>
              p.data.some((e) => e.item.id === entry.item.id),
            )
          ) {
            return current
          }
          return {
            ...current,
            pages: current.pages.map((p, i) =>
              i === page
                ? { ...p, data: p.data.toSpliced(index, 0, entry) }
                : p,
            ),
          }
        })
      }
    },
    onSuccess: (_data, itemId) => {
      markOnWatchlist(queryClient, new Set([itemId]), false)
    },
    onSettled: () => {
      // This one still counts as in flight here.
      if (queryClient.isMutating({ mutationKey: removeKey }) > 1) return
      void queryClient.invalidateQueries({ queryKey: watchlistKeys.all })
    },
  })
}
