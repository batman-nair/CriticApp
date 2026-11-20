import { useOutletContext } from 'react-router'
import { ApiError } from '../../api/client'
import { useItem } from '../../api/queries/items'
import type { Item, SearchResult } from '../../api/types'
import type { WatchlistOutlet } from '../../lib/watchlistOutlet'

/**
 * A watchlist title as the add flow's picked result. The one place an `Item`
 * becomes one: a title on the watchlist has no review.
 */
export function itemToSearchResult(item: Item): SearchResult {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    image_url: item.image_url,
    start_year: item.start_year,
    end_year: item.end_year,
    genres: item.genres,
    provider_rating: item.provider_rating,
    my_review: null,
    on_watchlist: true,
  }
}

export type WatchlistStartStatus =
  'none' | 'loading' | 'not-found' | 'error' | 'ready'

export interface WatchlistStart {
  status: WatchlistStartStatus
  item?: SearchResult
  /**
   * The title came from the page's loaded entries, so it's on the watchlist.
   * `GET /items` can't say, so a direct link resolved that way is false.
   */
  onWatchlist: boolean
  retry: () => void
}

/**
 * The title Review it starts on: a loaded card's entry from the watchlist
 * page, without a request, or else the stored item (a direct link or a
 * reload). `none` without an id. Nothing is fetched while `active` is false,
 * so the list dropping the entry after the save never asks for it, nor
 * while the page's list first loads: on a reload the entry is usually on it,
 * and only it says the title is on the watchlist.
 */
export function useWatchlistStart(
  itemId: string | undefined,
  active: boolean,
): WatchlistStart {
  const outlet = useOutletContext<WatchlistOutlet | undefined>()
  const entry =
    itemId === undefined
      ? undefined
      : outlet?.entries.find((e) => e.item.id === itemId)
  const fetched = useItem(itemId ?? '', {
    enabled:
      itemId !== undefined && active && !entry && !outlet?.entriesPending,
  })
  const retry = () => void fetched.refetch()

  if (itemId === undefined) return { status: 'none', onWatchlist: false, retry }
  if (entry) {
    return {
      status: 'ready',
      item: itemToSearchResult(entry.item),
      onWatchlist: true,
      retry,
    }
  }
  if (fetched.data) {
    return {
      status: 'ready',
      item: itemToSearchResult(fetched.data),
      onWatchlist: false,
      retry,
    }
  }
  if (fetched.isError && !fetched.isFetching) {
    const notFound =
      fetched.error instanceof ApiError && fetched.error.status === 404
    return {
      status: notFound ? 'not-found' : 'error',
      onWatchlist: false,
      retry,
    }
  }
  return { status: 'loading', onWatchlist: false, retry }
}
