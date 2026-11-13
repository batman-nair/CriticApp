import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { ApiError, client, unwrap } from '../client'
import type { paths } from '../schema'
import type { Review, ReviewPage, ReviewUpdate } from '../types'
import { tagKeys } from './tags'

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
  allFacets: () => [...all, 'facets'] as const,
  facets: (params: ReviewFacetsParams) => [...all, 'facets', params] as const,
  detail: (id: number) => [...all, 'detail', id] as const,
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

/** The review with `id` from any list already in the cache. */
function findListedReview(
  queryClient: QueryClient,
  id: number,
): Review | undefined {
  const lists = queryClient.getQueriesData<InfiniteData<ReviewPage>>({
    queryKey: reviewKeys.lists(),
  })
  for (const [, data] of lists) {
    for (const page of data?.pages ?? []) {
      const review = page.data.find((r) => r.id === id)
      if (review) return review
    }
  }
  return undefined
}

/**
 * One review. A list that already holds it shows it at once as placeholder
 * data, but the review is still fetched, so a 404 for one deleted elsewhere
 * wins.
 */
export function useReview(id: number) {
  const queryClient = useQueryClient()
  // Typed, or the placeholder function makes useQuery infer the data as a
  // function.
  return useQuery<Review>({
    queryKey: reviewKeys.detail(id),
    queryFn: async ({ signal }) => {
      const body = await unwrap(
        client.GET('/api/v3/reviews/{id}', {
          params: { path: { id } },
          signal,
        }),
      )
      return body.data
    },
    enabled: Number.isInteger(id) && id > 0,
    placeholderData: () => findListedReview(queryClient, id),
  })
}

/**
 * Saves the fields sent. The saved review shows at once; the lists, counts,
 * the review itself and the tags refetch behind it.
 */
export function useUpdateReview(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (update: ReviewUpdate) => {
      const body = await unwrap(
        client.PATCH('/api/v3/reviews/{id}', {
          params: { path: { id } },
          body: update,
        }),
      )
      return body.data
    },
    onSuccess: (review) => {
      queryClient.setQueryData<Review>(reviewKeys.detail(id), review)
      // Not awaited, so the save doesn't wait for the refetch.
      void queryClient.invalidateQueries({ queryKey: reviewKeys.all })
      void queryClient.invalidateQueries({ queryKey: tagKeys.all })
    },
  })
}

/**
 * Deletes the review. One already deleted elsewhere (404) counts as deleted.
 */
export function useDeleteReview(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      try {
        await unwrap(
          client.DELETE('/api/v3/reviews/{id}', { params: { path: { id } } }),
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return
        throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: reviewKeys.allFacets() })
      void queryClient.invalidateQueries({ queryKey: tagKeys.all })
      // Marked stale without a refetch: the closing dialog would otherwise
      // flip to "Review not found". A later visit refetches and gets the 404.
      void queryClient.invalidateQueries({
        queryKey: reviewKeys.detail(id),
        refetchType: 'none',
      })
    },
  })
}
