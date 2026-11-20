import type { SearchCategory } from '../api/types'

/**
 * What the watchlist page hands its child routes through `<Outlet context>`.
 * It lives here because the watchlist and the add-review features don't
 * import each other.
 */
export interface WatchlistOutlet {
  /** A title was added, by its stored id, which the page's cards use. */
  onAdded: (itemId: string) => void
}

/**
 * The link state that opens `/watchlist/add` from the page: closing goes
 * Back, and the sheet starts on `category` (Movies without one).
 */
export interface WatchlistAddState {
  fromParent: true
  category?: SearchCategory
}
