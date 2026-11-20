import { useSearchParams } from 'react-router'
import type { WatchlistListParams } from '../../api/queries/watchlist'
import { isFilterCategory, type FilterCategory } from '../../lib/categories'

/** A chip id, or `''` for "All". */
export type WatchlistCategory = FilterCategory | ''

/**
 * The category in the URL. A value the API would reject or the chips don't
 * offer, such as an unknown category, a comma list or the parent `anime`,
 * reads as "All".
 */
export function parseWatchlistCategory(
  params: URLSearchParams,
): WatchlistCategory {
  const category = params.get('category') ?? ''
  return isFilterCategory(category) ? category : ''
}

/** The list's params, so the "All" key stays exactly `{}`. */
export function toListParams(category: WatchlistCategory): WatchlistListParams {
  return category ? { category: [category] } : {}
}

/** The category filter, read from and written to `?category=`. */
export function useWatchlistCategory() {
  const [searchParams, setSearchParams] = useSearchParams()
  const category = parseWatchlistCategory(searchParams)

  /** `replace` writes over the current history entry instead of adding one. */
  function setCategory(
    next: WatchlistCategory,
    { replace = false }: { replace?: boolean } = {},
  ) {
    // Picking what's already picked doesn't add a history entry.
    if (next === category) return
    const params = new URLSearchParams(searchParams)
    if (next) params.set('category', next)
    else params.delete('category')
    // Root's ScrollRestoration would scroll to the top on every pick.
    setSearchParams(params, { preventScrollReset: true, replace })
  }

  return { category, setCategory }
}
