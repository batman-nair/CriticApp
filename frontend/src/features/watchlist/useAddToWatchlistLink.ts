import { useLocation, type To } from 'react-router'
import type { SearchCategory } from '../../api/types'
import type { FilterCategory } from '../../lib/categories'
import type { WatchlistAddState } from '../../lib/watchlistOutlet'

/** Props to spread onto a `Link` that opens the add sheet. */
export interface AddToWatchlistLink {
  to: To
  state: WatchlistAddState
}

/**
 * Opens `/watchlist/add` over the page, starting on `category` (Movies
 * without one). It keeps the page's query, so the page behind keeps its
 * filter, and closing goes Back.
 */
export function useAddToWatchlistLink(
  category?: SearchCategory,
): AddToWatchlistLink {
  const location = useLocation()
  return {
    to: { pathname: '/watchlist/add', search: location.search },
    // `fromParentState`, typed for the sheet.
    state: category ? { fromParent: true, category } : { fromParent: true },
  }
}

/** The search category for a chip: both anime chips search anime. */
export function searchCategoryFor(filter: FilterCategory): SearchCategory {
  return filter === 'anime:series' || filter === 'anime:movie'
    ? 'anime'
    : filter
}
