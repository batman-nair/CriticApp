import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { client, unwrap } from '../client'
import type { paths } from '../schema'
import type { ReviewPage } from '../types'

export const REVIEW_PAGE_SIZE = 20

/** The list filters. Paging is the query's job. */
export type ReviewListParams = Omit<
  NonNullable<paths['/api/v3/reviews']['get']['parameters']['query']>,
  'limit' | 'offset'
>

/** The filters the counts take. */
export type ReviewFacetsParams = NonNullable<
  paths['/api/v3/reviews/facets']['get']['parameters']['query']
>

const all = ['reviews'] as const
const lists = () => [...all, 'list'] as const

/**
 * The facets sit under `all`, not `lists()`, so a mutation that changes
 * reviews should invalidate `all` to refresh the counts too.
 */
export const reviewKeys = {
  all,
  lists,
  list: (params: ReviewListParams) => [...lists(), params] as const,
  facets: (params: ReviewFacetsParams) => [...all, 'facets', params] as const,
}

function nextOffset(last: ReviewPage) {
  // An empty page means reviews were deleted while scrolling. Stop there
  // rather than ask for the same offset forever.
  if (last.data.length === 0) return undefined
  const { count, offset } = last.meta.pagination
  const next = offset + last.data.length
  return next < count ? next : undefined
}

/** Pages of reviews, with the count in each page's `meta`. */
export function useReviewList(params: ReviewListParams) {
  return useInfiniteQuery({
    queryKey: reviewKeys.list(params),
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        client.GET('/api/v3/reviews', {
          params: {
            query: { ...params, limit: REVIEW_PAGE_SIZE, offset: pageParam },
          },
          signal,
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    // Keeps the last filter's reviews on screen while the next one loads.
    placeholderData: keepPreviousData,
  })
}

/** The counts per category and language for the chips and the menu. */
export function useReviewFacets(params: ReviewFacetsParams) {
  return useQuery({
    queryKey: reviewKeys.facets(params),
    queryFn: async ({ signal }) => {
      const body = await unwrap(
        client.GET('/api/v3/reviews/facets', {
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
