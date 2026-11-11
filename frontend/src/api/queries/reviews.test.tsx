import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { OWNER_USERNAME } from '../../config'
import { makeReview, makeReviewPage } from '../../test/fixtures'
import { http } from '../../test/handlers'
import { queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { ApiError } from '../client'
import type { ReviewPage } from '../types'
import { REVIEW_PAGE_SIZE, reviewKeys, useReviewList } from './reviews'

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
