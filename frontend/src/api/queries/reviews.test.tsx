import type { InfiniteData } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { OWNER_USERNAME } from '../../config'
import { makeProblem, makeReview, makeReviewPage } from '../../test/fixtures'
import { http } from '../../test/handlers'
import { createTestQueryClient, queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { ApiError } from '../client'
import { createQueryClient } from '../queryClient'
import type { Review, ReviewPage } from '../types'
import {
  REVIEW_PAGE_SIZE,
  duplicateReviewId,
  reviewKeys,
  useCreateReview,
  useDeleteReview,
  useReview,
  useReviewFacets,
  useReviewList,
  useUpdateReview,
  type ReviewListParams,
} from './reviews'
import { searchKeys } from './search'
import { tagKeys } from './tags'

function reviews(count: number, firstId = 1) {
  return Array.from({ length: count }, (_, i) =>
    makeReview({ id: firstId + i }),
  )
}

/** Serves `pages` by offset and records each request's query string. */
function servePages(pages: Record<number, ReviewPage>) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get('/api/v3/reviews', ({ request, response }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      const page = pages[Number(params.get('offset'))]
      if (!page) throw new Error(`No page at ${params.get('offset')}`)
      return response(200).json(page)
    }),
  )
  return requests
}

function renderUseReviewList() {
  return renderHook(() => useReviewList({ username: OWNER_USERNAME }), {
    wrapper: queryWrapper(),
  })
}

it('asks for the first page of the owner’s reviews', async () => {
  const requests = servePages({ 0: makeReviewPage(reviews(2)) })
  const { result } = renderUseReviewList()

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(requests.map((params) => Object.fromEntries(params))).toEqual([
    { username: OWNER_USERNAME, limit: '20', offset: '0' },
  ])
  expect(result.current.data?.pages[0]?.data.map((r) => r.id)).toEqual([1, 2])
})

it('asks for the next page after the reviews it has', async () => {
  const requests = servePages({
    0: makeReviewPage(reviews(REVIEW_PAGE_SIZE), { count: 45 }),
    20: makeReviewPage(reviews(REVIEW_PAGE_SIZE, 21), {
      count: 45,
      offset: 20,
    }),
  })
  const { result } = renderUseReviewList()

  await waitFor(() => expect(result.current.hasNextPage).toBe(true))
  act(() => void result.current.fetchNextPage())

  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
  expect(requests.map((params) => params.get('offset'))).toEqual(['0', '20'])
  expect(requests[1]?.get('username')).toBe(OWNER_USERNAME)
  expect(result.current.hasNextPage).toBe(true)
})

it('has no next page once it has every review', async () => {
  servePages({
    0: makeReviewPage(reviews(REVIEW_PAGE_SIZE), { count: 25 }),
    20: makeReviewPage(reviews(5, 21), { count: 25, offset: 20 }),
  })
  const { result } = renderUseReviewList()

  await waitFor(() => expect(result.current.hasNextPage).toBe(true))
  act(() => void result.current.fetchNextPage())

  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
  expect(result.current.hasNextPage).toBe(false)
})

it('has no next page after an empty page', async () => {
  // The count still says there are more, as when reviews were deleted
  // between the two requests.
  servePages({
    0: makeReviewPage(reviews(REVIEW_PAGE_SIZE), { count: 45 }),
    20: makeReviewPage([], { count: 45, offset: 20 }),
  })
  const { result } = renderUseReviewList()

  await waitFor(() => expect(result.current.hasNextPage).toBe(true))
  act(() => void result.current.fetchNextPage())

  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
  expect(result.current.hasNextPage).toBe(false)
})

it('exposes a failure as an ApiError', async () => {
  server.use(
    http.get('/api/v3/reviews', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 500 })),
    ),
  )
  const { result } = renderUseReviewList()

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect(result.current.error).toMatchObject({ status: 500 })
})

it('keys every list under the lists key', () => {
  const key = reviewKeys.list({ username: 'someone' })

  expect(key.slice(0, 2)).toEqual(reviewKeys.lists())
  expect(reviewKeys.lists().slice(0, 1)).toEqual(reviewKeys.all)
})

it('keeps the previous reviews while the next filter loads', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.get('/api/v3/reviews', async ({ request, response }) => {
      const q = new URL(request.url).searchParams.get('q')
      if (q === null) return response(200).json(makeReviewPage(reviews(2)))
      await gate
      return response(200).json(makeReviewPage(reviews(1, 10)))
    }),
  )
  const { result, rerender } = renderHook(
    (params: ReviewListParams) => useReviewList(params),
    {
      wrapper: queryWrapper(),
      initialProps: { username: OWNER_USERNAME } as ReviewListParams,
    },
  )
  await waitFor(() => expect(result.current.isSuccess).toBe(true))

  rerender({ username: OWNER_USERNAME, q: 'dune' })

  expect(result.current.isPlaceholderData).toBe(true)
  expect(result.current.data?.pages[0]?.data.map((r) => r.id)).toEqual([1, 2])

  release()
  await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
  expect(result.current.data?.pages[0]?.data.map((r) => r.id)).toEqual([10])
})

it('asks for the facets with the filters and returns the counts', async () => {
  const requests: URLSearchParams[] = []
  const facets = {
    total: 3,
    categories: [{ id: 'movie', count: 3 }],
    languages: [{ name: 'English', count: 3 }],
  }
  server.use(
    http.get('/api/v3/reviews/facets', ({ request, response }) => {
      requests.push(new URL(request.url).searchParams)
      return response(200).json({ data: facets, meta: {} })
    }),
  )
  const { result } = renderHook(
    () =>
      useReviewFacets({
        username: OWNER_USERNAME,
        q: 'dune',
        category: ['movie'],
        language: ['English'],
      }),
    { wrapper: queryWrapper() },
  )

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(requests.map((params) => Object.fromEntries(params))).toEqual([
    {
      username: OWNER_USERNAME,
      q: 'dune',
      category: 'movie',
      language: 'English',
    },
  ])
  expect(result.current.data).toEqual(facets)
})

it('exposes a facets failure as an ApiError', async () => {
  server.use(
    http.get('/api/v3/reviews/facets', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 500 })),
    ),
  )
  const { result } = renderHook(
    () => useReviewFacets({ username: OWNER_USERNAME }),
    { wrapper: queryWrapper() },
  )

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect(result.current.error).toMatchObject({ status: 500 })
})

it('keys the facets under all, outside the lists', () => {
  const key = reviewKeys.facets({ username: 'someone' })

  expect(key.slice(0, 1)).toEqual(reviewKeys.all)
  expect(key.slice(0, 2)).not.toEqual(reviewKeys.lists())
})

/** Serves `review` at its id and records the requested paths. */
function serveReview(review: Review, gate?: Promise<void>) {
  const requests: string[] = []
  server.use(
    http.get('/api/v3/reviews/{id}', async ({ request, response }) => {
      requests.push(new URL(request.url).pathname)
      await gate
      return response(200).json({ data: review, meta: {} })
    }),
  )
  return requests
}

it('asks for the review by id and returns it', async () => {
  const review = makeReview()
  const requests = serveReview(review)
  const { result } = renderHook(() => useReview(1), {
    wrapper: queryWrapper(),
  })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(requests).toEqual(['/api/v3/reviews/1'])
  expect(result.current.data).toEqual(review)
})

it('shows the review from a cached list until the response arrives', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const listed = makeReview({ id: 2, rating: 7 })
  const fresh = makeReview({ id: 2, rating: 8 })
  serveReview(fresh, gate)
  const queryClient = createTestQueryClient()
  queryClient.setQueryData<InfiniteData<ReviewPage>>(
    reviewKeys.list({ username: OWNER_USERNAME }),
    {
      pages: [
        makeReviewPage([makeReview()], { count: 3 }),
        makeReviewPage([listed, makeReview({ id: 3 })], {
          count: 3,
          offset: 1,
        }),
      ],
      pageParams: [0, 1],
    },
  )
  const { result } = renderHook(() => useReview(2), {
    wrapper: queryWrapper(queryClient),
  })

  expect(result.current.isPlaceholderData).toBe(true)
  expect(result.current.data).toEqual(listed)

  release()
  await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
  expect(result.current.data).toEqual(fresh)
})

it('has no placeholder when no list holds the review', () => {
  serveReview(makeReview({ id: 7 }), new Promise(() => {}))
  const { result } = renderHook(() => useReview(7), {
    wrapper: queryWrapper(),
  })

  expect(result.current.isPending).toBe(true)
  expect(result.current.data).toBeUndefined()
})

it.each([Number.NaN, 1.5, 0, -1])('stays idle for the id %s', (id) => {
  const requests = serveReview(makeReview())
  const { result } = renderHook(() => useReview(id), {
    wrapper: queryWrapper(),
  })

  expect(result.current.fetchStatus).toBe('idle')
  expect(result.current.isPending).toBe(true)
  expect(requests).toEqual([])
})

it('rejects a missing review with a 404 ApiError, without retrying', async () => {
  let requests = 0
  server.use(
    http.get('/api/v3/reviews/{id}', ({ response }) => {
      requests += 1
      return response(404).json(makeProblem())
    }),
  )
  // The app's client, whose retry rule is under test here.
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 },
  })
  const { result } = renderHook(() => useReview(99), {
    wrapper: queryWrapper(queryClient),
  })

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect(result.current.error).toMatchObject({ status: 404 })
  expect(requests).toBe(1)
})

it('keys a review under all, outside the lists', () => {
  const key = reviewKeys.detail(1)

  expect(key.slice(0, 1)).toEqual(reviewKeys.all)
  expect(key.slice(0, 2)).not.toEqual(reviewKeys.lists())
})

const listKey = reviewKeys.list({ username: OWNER_USERNAME })
const facetsKey = reviewKeys.facets({ username: OWNER_USERNAME })
const searchKey = searchKeys.list({ category: 'game', q: 'witcher' })

/**
 * A client holding a list, the counts, the tags and a search, none of them
 * stale.
 */
function seededQueryClient() {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(listKey, 'old list')
  queryClient.setQueryData(facetsKey, 'old facets')
  queryClient.setQueryData(tagKeys.list(), 'old tags')
  queryClient.setQueryData(searchKey, 'old search')
  return queryClient
}

function isInvalidated(
  queryClient: ReturnType<typeof createTestQueryClient>,
  queryKey: readonly unknown[],
) {
  return queryClient.getQueryState(queryKey)?.isInvalidated
}

it('sends the update, shows the saved review and refetches the rest, search included', async () => {
  const sent: unknown[] = []
  const saved = makeReview({ rating: 7, text: 'Fine.', tags: ['cozy'] })
  server.use(
    http.patch('/api/v3/reviews/{id}', async ({ request, response }) => {
      sent.push([new URL(request.url).pathname, await request.json()])
      return response(200).json({ data: saved, meta: {} })
    }),
  )
  const queryClient = seededQueryClient()
  const { result } = renderHook(() => useUpdateReview(1), {
    wrapper: queryWrapper(queryClient),
  })

  const returned = await act(() =>
    result.current.mutateAsync({ rating: 7, text: 'Fine.', tags: ['cozy'] }),
  )

  expect(sent).toEqual([
    ['/api/v3/reviews/1', { rating: 7, text: 'Fine.', tags: ['cozy'] }],
  ])
  expect(returned).toEqual(saved)
  expect(queryClient.getQueryData(reviewKeys.detail(1))).toEqual(saved)
  expect(isInvalidated(queryClient, listKey)).toBe(true)
  expect(isInvalidated(queryClient, facetsKey)).toBe(true)
  expect(isInvalidated(queryClient, tagKeys.list())).toBe(true)
  expect(isInvalidated(queryClient, searchKey)).toBe(true)
})

it('rejects a refused update with an ApiError carrying the field errors', async () => {
  const errors = [
    { field: 'text', code: 'max_length', message: 'Too long.' },
    { field: 'tags.0', code: 'invalid', message: 'Letters only.' },
  ]
  server.use(
    http.patch('/api/v3/reviews/{id}', ({ response }) =>
      response(400).json(
        makeProblem({
          title: 'Bad Request',
          status: 400,
          code: 'VALIDATION_ERROR',
          detail: 'Invalid input.',
          errors,
        }),
      ),
    ),
  )
  const queryClient = seededQueryClient()
  const { result } = renderHook(() => useUpdateReview(1), {
    wrapper: queryWrapper(queryClient),
  })

  act(() => result.current.mutate({ text: 'x' }))

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect(result.current.error).toMatchObject({ status: 400, errors })
  expect(queryClient.getQueryData(reviewKeys.detail(1))).toBeUndefined()
  expect(isInvalidated(queryClient, listKey)).toBe(false)
})

it('sends the new review, caches it and refetches the rest', async () => {
  const sent: unknown[] = []
  const created = makeReview({
    id: 12,
    rating: 7,
    text: 'Fine.',
    tags: ['cozy'],
  })
  server.use(
    http.post('/api/v3/reviews', async ({ request, response }) => {
      sent.push(await request.json())
      return response(201).json({ data: created, meta: {} })
    }),
  )
  const queryClient = seededQueryClient()
  const { result } = renderHook(() => useCreateReview(), {
    wrapper: queryWrapper(queryClient),
  })

  const returned = await act(() =>
    result.current.mutateAsync({
      item_id: 'mal:1',
      rating: 7,
      text: 'Fine.',
      tags: ['cozy'],
    }),
  )

  expect(sent).toEqual([
    { item_id: 'mal:1', rating: 7, text: 'Fine.', tags: ['cozy'] },
  ])
  expect(returned).toEqual(created)
  expect(queryClient.getQueryData(reviewKeys.detail(12))).toEqual(created)
  expect(isInvalidated(queryClient, listKey)).toBe(true)
  expect(isInvalidated(queryClient, facetsKey)).toBe(true)
  expect(isInvalidated(queryClient, tagKeys.list())).toBe(true)
  expect(isInvalidated(queryClient, searchKey)).toBe(true)
})

function duplicateProblem(existing_review_id: unknown) {
  return {
    ...makeProblem({
      title: 'Conflict',
      status: 409,
      code: 'DUPLICATE_REVIEW',
      detail: 'You already reviewed this.',
    }),
    existing_review_id,
  }
}

it('rejects a duplicate with the existing review’s id and refetches nothing', async () => {
  server.use(
    http.post('/api/v3/reviews', ({ response }) =>
      response.untyped(
        HttpResponse.json(duplicateProblem(7), {
          status: 409,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      ),
    ),
  )
  const queryClient = seededQueryClient()
  const { result } = renderHook(() => useCreateReview(), {
    wrapper: queryWrapper(queryClient),
  })

  act(() => result.current.mutate({ item_id: 'mal:1', rating: 7 }))

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(duplicateReviewId(result.current.error)).toBe(7)
  expect(isInvalidated(queryClient, listKey)).toBe(false)
  expect(isInvalidated(queryClient, searchKey)).toBe(false)
})

it.each([
  [
    'a 409 with another code',
    new ApiError({
      kind: 'problem',
      status: 409,
      code: 'CONFLICT',
      detail: 'x',
      problem: { existing_review_id: 7 },
    }),
  ],
  [
    'a duplicate without an integer id',
    new ApiError({
      kind: 'problem',
      status: 409,
      code: 'DUPLICATE_REVIEW',
      detail: 'x',
      problem: duplicateProblem('7'),
    }),
  ],
  [
    'a 400',
    new ApiError({
      kind: 'problem',
      status: 400,
      code: 'VALIDATION_ERROR',
      detail: 'x',
      problem: { existing_review_id: 7 },
    }),
  ],
  [
    'a network error',
    new ApiError({
      kind: 'network',
      status: 0,
      code: 'NETWORK_ERROR',
      detail: 'x',
    }),
  ],
  ['an Error', new Error('x')],
  ['nothing', null],
])('has no duplicate id for %s', (_, error) => {
  expect(duplicateReviewId(error)).toBeNull()
})

/** Serves DELETE with `status` and records the deleted paths. */
function serveDelete(status: 204 | 404 | 500) {
  const requests: string[] = []
  server.use(
    http.delete('/api/v3/reviews/{id}', ({ request, response }) => {
      requests.push(new URL(request.url).pathname)
      if (status === 204) return response(204).empty()
      if (status === 404) return response(404).json(makeProblem())
      return response.untyped(new HttpResponse(null, { status }))
    }),
  )
  return requests
}

it('deletes the review and refetches the lists, counts, tags and search, but not the review', async () => {
  const deleted = serveDelete(204)
  const fetched = serveReview(makeReview())
  const queryClient = seededQueryClient()
  const { result } = renderHook(
    () => ({ review: useReview(1), remove: useDeleteReview(1) }),
    { wrapper: queryWrapper(queryClient) },
  )
  await waitFor(() => expect(result.current.review.isSuccess).toBe(true))

  await act(() => result.current.remove.mutateAsync())

  expect(deleted).toEqual(['/api/v3/reviews/1'])
  expect(isInvalidated(queryClient, listKey)).toBe(true)
  expect(isInvalidated(queryClient, facetsKey)).toBe(true)
  expect(isInvalidated(queryClient, tagKeys.list())).toBe(true)
  expect(isInvalidated(queryClient, searchKey)).toBe(true)
  expect(isInvalidated(queryClient, reviewKeys.detail(1))).toBe(true)
  expect(result.current.review.fetchStatus).toBe('idle')
  expect(fetched).toEqual(['/api/v3/reviews/1'])
})

it('counts a review already deleted elsewhere (404) as deleted', async () => {
  serveDelete(404)
  const queryClient = seededQueryClient()
  const { result } = renderHook(() => useDeleteReview(1), {
    wrapper: queryWrapper(queryClient),
  })

  await act(() => result.current.mutateAsync())

  expect(result.current.isSuccess).toBe(true)
  expect(isInvalidated(queryClient, listKey)).toBe(true)
})

it('exposes a failed delete as an ApiError and refetches nothing', async () => {
  serveDelete(500)
  const queryClient = seededQueryClient()
  const { result } = renderHook(() => useDeleteReview(1), {
    wrapper: queryWrapper(queryClient),
  })

  act(() => result.current.mutate())

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect(result.current.error).toMatchObject({ status: 500 })
  expect(isInvalidated(queryClient, listKey)).toBe(false)
})
