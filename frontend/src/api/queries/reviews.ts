import { useInfiniteQuery } from '@tanstack/react-query'
import { client, unwrap } from '../client'
import type { paths } from '../schema'
import type { ReviewPage } from '../types'

export const REVIEW_PAGE_SIZE = 20

/** The list filters. Paging is the query's job. */
export type ReviewListParams = Omit<
  NonNullable<paths['/api/v3/reviews']['get']['parameters']['query']>,
  'limit' | 'offset'
>

const all = ['reviews'] as const
const lists = () => [...all, 'list'] as const

export const reviewKeys = {
  all,
  lists,
  list: (params: ReviewListParams) => [...lists(), params] as const,
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
  })
}
