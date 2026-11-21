import { useSearchParams } from 'react-router'
import type {
  WatchlistFacetsParams,
  WatchlistListParams,
} from '../../api/queries/watchlist'
import { isFilterCategory } from '../../lib/categories'

export type WatchlistSort = NonNullable<WatchlistListParams['sort']>

/** The sort menu's options, the default first. */
export const WATCHLIST_SORTS = [
  { value: '-added', label: 'Recently added' },
  { value: 'title', label: 'A–Z' },
  { value: '-rating', label: 'Rating: high to low' },
  { value: 'rating', label: 'Rating: low to high' },
  { value: '-year', label: 'Release year: newest first' },
] as const satisfies readonly { value: WatchlistSort; label: string }[]

/** `''` is "All" for the category and "any" for the language. */
export interface WatchlistFilters {
  q: string
  category: string
  language: string
  sort: WatchlistSort
}

const DEFAULT_FILTERS: WatchlistFilters = {
  q: '',
  category: '',
  language: '',
  sort: '-added',
}

const FILTER_KEYS = ['q', 'category', 'language', 'sort'] as const

function isSort(value: string): value is WatchlistSort {
  return WATCHLIST_SORTS.some((sort) => sort.value === value)
}

/**
 * The filters in the URL. A value the API would reject or the panel doesn't
 * offer, such as an unknown category, a comma list or the parent `anime`,
 * falls back to its default.
 */
export function parseWatchlistFilters(
  params: URLSearchParams,
): WatchlistFilters {
  const category = params.get('category') ?? ''
  const sort = params.get('sort') ?? ''
  return {
    q: params.get('q')?.trim() ?? '',
    category: isFilterCategory(category) ? category : DEFAULT_FILTERS.category,
    language: params.get('language')?.trim() ?? '',
    sort: isSort(sort) ? sort : DEFAULT_FILTERS.sort,
  }
}

/**
 * A copy of `params` holding `filters`, with the defaults left out. Params
 * that aren't filters are kept.
 */
export function writeWatchlistFilters(
  params: URLSearchParams,
  filters: WatchlistFilters,
): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const key of FILTER_KEYS) {
    next.delete(key)
    if (filters[key] !== DEFAULT_FILTERS[key]) next.set(key, filters[key])
  }
  return next
}

/**
 * The counts' params: only the filters that are set, so the unfiltered key
 * stays exactly `{}`, the header tab's.
 */
export function toFacetParams(
  filters: WatchlistFilters,
): WatchlistFacetsParams {
  const params: WatchlistFacetsParams = {}
  if (filters.q) params.q = filters.q
  if (isFilterCategory(filters.category)) params.category = [filters.category]
  if (filters.language) params.language = [filters.language]
  return params
}

/** The list's params: the counts' params plus a sort other than the default. */
export function toListParams(filters: WatchlistFilters): WatchlistListParams {
  const params: WatchlistListParams = toFacetParams(filters)
  if (filters.sort !== DEFAULT_FILTERS.sort) params.sort = filters.sort
  return params
}

interface SetFiltersOptions {
  /** Replace the history entry rather than push one. */
  replace?: boolean
}

/** The watchlist's filters, read from and written to the URL. */
export function useWatchlistFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseWatchlistFilters(searchParams)
  const isFiltered = Boolean(filters.q || filters.category || filters.language)

  function setFilters(
    patch: Partial<WatchlistFilters>,
    { replace = false }: SetFiltersOptions = {},
  ) {
    const next = { ...filters, ...patch }
    // Picking what's already picked doesn't add a history entry.
    if (FILTER_KEYS.every((key) => next[key] === filters[key])) return
    setSearchParams(writeWatchlistFilters(searchParams, next), {
      replace,
      // Root's ScrollRestoration would scroll to the top on every pick.
      preventScrollReset: true,
    })
  }

  /** Clears the search, category and language. The sort stays. */
  function clearFilters(options: SetFiltersOptions = {}) {
    setFilters({ q: '', category: '', language: '' }, options)
  }

  return { filters, isFiltered, setFilters, clearFilters }
}
