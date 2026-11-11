import { useSearchParams } from 'react-router'
import type {
  ReviewFacetsParams,
  ReviewListParams,
} from '../../api/queries/reviews'
import { OWNER_USERNAME } from '../../config'

export type ReviewSort = NonNullable<ReviewListParams['sort']>

type CategoryId = NonNullable<ReviewListParams['category']>[number]

/**
 * The chips after "All", in /categories order. The panel labels the chips
 * from this whenever the facets aren't there.
 */
export const FILTER_CATEGORIES = [
  'movie',
  'series',
  'game',
  'anime:series',
  'anime:movie',
  'manga',
  'book',
] as const satisfies readonly CategoryId[]

export type FilterCategory = (typeof FILTER_CATEGORIES)[number]

/** The sort menu's options, the default first. */
export const SORTS = [
  { value: '-updated', label: 'Recently updated' },
  { value: 'title', label: 'A–Z' },
  { value: '-rating', label: 'Rating: high to low' },
  { value: 'rating', label: 'Rating: low to high' },
] as const satisfies readonly { value: ReviewSort; label: string }[]

/** `''` is "All" for the category and "any" for the language. */
export interface ReviewFilters {
  q: string
  category: string
  language: string
  sort: ReviewSort
}

const DEFAULT_FILTERS: ReviewFilters = {
  q: '',
  category: '',
  language: '',
  sort: '-updated',
}

const FILTER_KEYS = ['q', 'category', 'language', 'sort'] as const

function isFilterCategory(value: string): value is FilterCategory {
  return (FILTER_CATEGORIES as readonly string[]).includes(value)
}

function isSort(value: string): value is ReviewSort {
  return SORTS.some((sort) => sort.value === value)
}

/**
 * The filters in the URL. A value the API would reject, such as an unknown
 * category, a comma list or a parent category, falls back to its default.
 */
export function parseReviewFilters(params: URLSearchParams): ReviewFilters {
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
export function writeReviewFilters(
  params: URLSearchParams,
  filters: ReviewFilters,
): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const key of FILTER_KEYS) {
    next.delete(key)
    if (filters[key] !== DEFAULT_FILTERS[key]) next.set(key, filters[key])
  }
  return next
}

/**
 * The counts' params: the owner plus only the filters that are set, so the
 * unfiltered key stays exactly `{ username }`.
 */
export function toFacetParams(filters: ReviewFilters): ReviewFacetsParams {
  const params: ReviewFacetsParams = { username: OWNER_USERNAME }
  if (filters.q) params.q = filters.q
  if (isFilterCategory(filters.category)) params.category = [filters.category]
  if (filters.language) params.language = [filters.language]
  return params
}

/** The list's params: the counts' params plus a sort other than the default. */
export function toListParams(filters: ReviewFilters): ReviewListParams {
  const params: ReviewListParams = toFacetParams(filters)
  if (filters.sort !== DEFAULT_FILTERS.sort) params.sort = filters.sort
  return params
}

interface SetFiltersOptions {
  /** Replace the history entry rather than push one. */
  replace?: boolean
}

/** The list filters, read from and written to the URL. */
export function useReviewFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseReviewFilters(searchParams)
  const isFiltered = Boolean(filters.q || filters.category || filters.language)

  function setFilters(
    patch: Partial<ReviewFilters>,
    { replace = false }: SetFiltersOptions = {},
  ) {
    const next = { ...filters, ...patch }
    // Picking what's already picked doesn't add a history entry.
    if (FILTER_KEYS.every((key) => next[key] === filters[key])) return
    setSearchParams(writeReviewFilters(searchParams, next), {
      replace,
      // Root's ScrollRestoration would scroll to the top on every keystroke.
      preventScrollReset: true,
    })
  }

  /** Clears the search, category and language. The sort stays. */
  function clearFilters() {
    setFilters({ q: '', category: '', language: '' })
  }

  return { filters, isFiltered, setFilters, clearFilters }
}
