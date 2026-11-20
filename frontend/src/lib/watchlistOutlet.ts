import type { SearchCategory, WatchlistEntry } from '../api/types'

/**
 * What the watchlist page hands its child routes (the add sheet and Review
 * it) through `<Outlet context>`. It lives here because the watchlist and the
 * add-review features don't import each other.
 */
export interface WatchlistOutlet {
  /** A title was added, by its stored id, which the page's cards use. */
  onAdded: (itemId: string) => void
  /**
   * The entries the page has loaded, each once, so Review it starts on a
   * card's title without fetching it.
   */
  entries: readonly WatchlistEntry[]
  /**
   * The list's first load is under way, so `entries` can't say yet whether a
   * title is on the watchlist.
   */
  entriesPending: boolean
}

/**
 * The link state that opens `/watchlist/add` from the page: closing goes
 * Back, and the sheet starts on `category` (Movies without one).
 */
export interface WatchlistAddState {
  fromParent: true
  category?: SearchCategory
}
