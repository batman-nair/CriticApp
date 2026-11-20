import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import {
  makeItem,
  makeWatchlistEntry,
  makeWatchlistFacets,
  makeWatchlistPage,
} from '../../test/fixtures'
import { http } from '../../test/handlers'
import { queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { ApiError } from '../client'
import type { WatchlistPage } from '../types'
import {
  WATCHLIST_PAGE_SIZE,
  useWatchlist,
  useWatchlistFacets,
  watchlistKeys,
  type WatchlistListParams,
} from './watchlist'

function entries(count: number, firstId = 1) {
  return Array.from({ length: count }, (_, i) =>
    makeWatchlistEntry({ item: makeItem({ id: `mal:${firstId + i}` }) }),
  )
}

function ids(page: WatchlistPage | undefined) {
  return page?.data.map((entry) => entry.item.id)
}

/** Serves `pages` by offset and records each request's query string. */
function servePages(pages: Record<number, WatchlistPage>) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get('/api/v3/watchlist', ({ request, response }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      const page = pages[Number(params.get('offset'))]
      if (!page) throw new Error(`No page at ${params.get('offset')}`)
      return response(200).json(page)
    }),
  )
  return requests
}

function renderUseWatchlist(params: WatchlistListParams = {}) {
  return renderHook(() => useWatchlist(params), { wrapper: queryWrapper() })
}

it('asks for the first page of the watchlist', async () => {
  const requests = servePages({ 0: makeWatchlistPage(entries(2)) })
  const { result } = renderUseWatchlist()

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(requests.map((params) => Object.fromEntries(params))).toEqual([
    { limit: '20', offset: '0' },
  ])
  expect(ids(result.current.data?.pages[0])).toEqual(['mal:1', 'mal:2'])
})

it('sends the category', async () => {
  const requests = servePages({ 0: makeWatchlistPage(entries(1)) })
  const { result } = renderUseWatchlist({ category: ['anime:movie'] })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(requests.map((params) => Object.fromEntries(params))).toEqual([
    { category: 'anime:movie', limit: '20', offset: '0' },
  ])
})

it('asks for the next page after the entries it has', async () => {
  const requests = servePages({
    0: makeWatchlistPage(entries(WATCHLIST_PAGE_SIZE), { count: 45 }),
    20: makeWatchlistPage(entries(WATCHLIST_PAGE_SIZE, 21), {
      count: 45,
      offset: 20,
    }),
  })
  const { result } = renderUseWatchlist({ category: ['movie'] })

  await waitFor(() => expect(result.current.hasNextPage).toBe(true))
  act(() => void result.current.fetchNextPage())

  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
  expect(requests.map((params) => params.get('offset'))).toEqual(['0', '20'])
  expect(requests[1]?.get('category')).toBe('movie')
  expect(result.current.hasNextPage).toBe(true)
})

it('has no next page once it has every entry', async () => {
  servePages({
    0: makeWatchlistPage(entries(WATCHLIST_PAGE_SIZE), { count: 25 }),
    20: makeWatchlistPage(entries(5, 21), { count: 25, offset: 20 }),
  })
  const { result } = renderUseWatchlist()

  await waitFor(() => expect(result.current.hasNextPage).toBe(true))
  act(() => void result.current.fetchNextPage())

  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
  expect(result.current.hasNextPage).toBe(false)
})

it('has no next page after an empty page', async () => {
  // The count still says there are more, as when entries were removed
  // between the two requests.
  servePages({
    0: makeWatchlistPage(entries(WATCHLIST_PAGE_SIZE), { count: 45 }),
    20: makeWatchlistPage([], { count: 45, offset: 20 }),
  })
  const { result } = renderUseWatchlist()

  await waitFor(() => expect(result.current.hasNextPage).toBe(true))
  act(() => void result.current.fetchNextPage())

  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
  expect(result.current.hasNextPage).toBe(false)
})

it('exposes a failure as an ApiError', async () => {
  server.use(
    http.get('/api/v3/watchlist', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 500 })),
    ),
  )
  const { result } = renderUseWatchlist()

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect(result.current.error).toMatchObject({ status: 500 })
})

it('keys every list under the lists key, and the facets outside it', () => {
  const list = watchlistKeys.list({ category: ['movie'] })
  const facets = watchlistKeys.facets()

  expect(list.slice(0, 2)).toEqual(watchlistKeys.lists())
  expect(watchlistKeys.lists().slice(0, 1)).toEqual(watchlistKeys.all)
  expect(facets.slice(0, 1)).toEqual(watchlistKeys.all)
  expect(facets.slice(0, 2)).not.toEqual(watchlistKeys.lists())
})

it('keeps the previous entries while the next category loads', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.get('/api/v3/watchlist', async ({ request, response }) => {
      const category = new URL(request.url).searchParams.get('category')
      if (category === null) {
        return response(200).json(makeWatchlistPage(entries(2)))
      }
      await gate
      return response(200).json(makeWatchlistPage(entries(1, 10)))
    }),
  )
  const { result, rerender } = renderHook(
    (params: WatchlistListParams) => useWatchlist(params),
    { wrapper: queryWrapper(), initialProps: {} as WatchlistListParams },
  )
  await waitFor(() => expect(result.current.isSuccess).toBe(true))

  rerender({ category: ['game'] })

  expect(result.current.isPlaceholderData).toBe(true)
  expect(ids(result.current.data?.pages[0])).toEqual(['mal:1', 'mal:2'])

  release()
  await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
  expect(ids(result.current.data?.pages[0])).toEqual(['mal:10'])
})

it('asks for the facets and returns the counts', async () => {
  const requests: URLSearchParams[] = []
  const body = makeWatchlistFacets({ game: 3 })
  server.use(
    http.get('/api/v3/watchlist/facets', ({ request, response }) => {
      requests.push(new URL(request.url).searchParams)
      return response(200).json(body)
    }),
  )
  const { result } = renderHook(() => useWatchlistFacets(), {
    wrapper: queryWrapper(),
  })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(requests.map((params) => params.toString())).toEqual([''])
  expect(result.current.data).toEqual(body.data)
  expect(result.current.data?.total).toBe(3)
})

it('exposes a failed facets request as an ApiError', async () => {
  server.use(
    http.get('/api/v3/watchlist/facets', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 503 })),
    ),
  )
  const { result } = renderHook(() => useWatchlistFacets(), {
    wrapper: queryWrapper(),
  })

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
})
