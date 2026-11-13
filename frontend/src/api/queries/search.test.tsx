import { renderHook, waitFor } from '@testing-library/react'
import { delay } from 'msw'
import { expect, it } from 'vitest'
import { makeProblem, makeSearchResult } from '../../test/fixtures'
import { http } from '../../test/handlers'
import { queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { ApiError } from '../client'
import { createQueryClient } from '../queryClient'
import type { SearchResult } from '../types'
import {
  isSearchCategory,
  searchKeys,
  useSearch,
  type SearchParams,
} from './search'

/**
 * Serves the results for each `category/q` and records each request's query string.
 * Slow, so a test can see the state while a request is in flight.
 */
function serveSearch(results: Record<string, SearchResult[]>) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get('/api/v3/search', async ({ request, response }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      await delay(50)
      return response(200).json({
        data: results[`${params.get('category')}/${params.get('q')}`] ?? [],
        meta: {},
      })
    }),
  )
  return requests
}

const witcher = makeSearchResult()
const zelda = makeSearchResult({
  id: 'igdb:7346',
  title: 'The Legend of Zelda: Breath of the Wild',
  start_year: 2017,
})

it('sends the category and q and returns the results', async () => {
  const requests = serveSearch({ 'game/witcher': [witcher] })
  const { result } = renderHook(
    () => useSearch({ category: 'game', q: 'witcher' }),
    { wrapper: queryWrapper() },
  )

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(requests.map((params) => Object.fromEntries(params))).toEqual([
    { category: 'game', q: 'witcher' },
  ])
  expect(result.current.data).toEqual([witcher])
})

it('does not fetch while disabled', () => {
  const requests = serveSearch({})
  const { result } = renderHook(
    () => useSearch({ category: 'game', q: 'wi' }, { enabled: false }),
    { wrapper: queryWrapper() },
  )

  expect(result.current.fetchStatus).toBe('idle')
  expect(requests).toEqual([])
})

it('does not retry a 502, even with the app’s retry rule', async () => {
  let requests = 0
  server.use(
    http.get('/api/v3/search', ({ response }) => {
      requests += 1
      return response(502).json(
        makeProblem({
          title: 'Bad Gateway',
          status: 502,
          code: 'UPSTREAM_ERROR',
          detail: 'IGDB is not answering.',
        }),
      )
    }),
  )
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 },
  })
  const { result } = renderHook(
    () => useSearch({ category: 'game', q: 'witcher' }),
    { wrapper: queryWrapper(queryClient) },
  )

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect(result.current.error).toMatchObject({
    status: 502,
    code: 'UPSTREAM_ERROR',
  })
  expect(requests).toBe(1)
})

it('keeps the last results while a new q loads', async () => {
  serveSearch({ 'game/witcher': [witcher], 'game/zelda': [zelda] })
  const { result, rerender } = renderHook(
    (params: SearchParams) => useSearch(params),
    {
      wrapper: queryWrapper(),
      initialProps: { category: 'game', q: 'witcher' },
    },
  )
  await waitFor(() => expect(result.current.data).toEqual([witcher]))

  rerender({ category: 'game', q: 'zelda' })

  expect(result.current.isPlaceholderData).toBe(true)
  expect(result.current.data).toEqual([witcher])
  await waitFor(() => expect(result.current.data).toEqual([zelda]))
  expect(result.current.isPlaceholderData).toBe(false)
})

it('drops the last results when the category changes', async () => {
  serveSearch({ 'game/witcher': [witcher] })
  const { result, rerender } = renderHook(
    (params: SearchParams) => useSearch(params),
    {
      wrapper: queryWrapper(),
      initialProps: { category: 'game', q: 'witcher' },
    },
  )
  await waitFor(() => expect(result.current.data).toEqual([witcher]))

  rerender({ category: 'book', q: 'witcher' })

  expect(result.current.isPlaceholderData).toBe(false)
  expect(result.current.data).toBeUndefined()
  expect(result.current.isPending).toBe(true)
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([])
})

it('tells the search categories apart from other ids', () => {
  expect(isSearchCategory('series')).toBe(true)
  expect(isSearchCategory('anime:series')).toBe(false)
  expect(isSearchCategory('')).toBe(false)
})

it('keys a search under all', () => {
  expect(searchKeys.list({ category: 'game', q: 'x' }).slice(0, 1)).toEqual(
    searchKeys.all,
  )
})
