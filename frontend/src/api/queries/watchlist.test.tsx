import type { InfiniteData } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  makeItem,
  makeProblem,
  makeSearchResult,
  makeWatchlistEntry,
  makeWatchlistFacets,
  makeWatchlistPage,
} from '../../test/fixtures'
import { http } from '../../test/handlers'
import { createTestQueryClient, queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { ApiError } from '../client'
import type { SearchResult, WatchlistPage } from '../types'
import { searchKeys, useSearch } from './search'
import {
  WATCHLIST_PAGE_SIZE,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useWatchlist,
  useWatchlistFacets,
  watchlistKeys,
  type WatchlistFacetsParams,
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
  const facets = watchlistKeys.facets({ q: 'dune' })

  expect(list.slice(0, 2)).toEqual(watchlistKeys.lists())
  expect(watchlistKeys.lists().slice(0, 1)).toEqual(watchlistKeys.all)
  expect(facets.slice(0, 2)).toEqual(watchlistKeys.allFacets())
  expect(watchlistKeys.allFacets().slice(0, 1)).toEqual(watchlistKeys.all)
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

it('asks for the facets with the filters', async () => {
  const requests: URLSearchParams[] = []
  const body = makeWatchlistFacets(
    { movie: 2 },
    { languages: [{ name: 'English', count: 2 }] },
  )
  server.use(
    http.get('/api/v3/watchlist/facets', ({ request, response }) => {
      requests.push(new URL(request.url).searchParams)
      return response(200).json(body)
    }),
  )
  const { result } = renderHook(
    () =>
      useWatchlistFacets({
        q: 'dune',
        category: ['movie'],
        language: ['English'],
      }),
    { wrapper: queryWrapper() },
  )

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(requests.map((params) => Object.fromEntries(params))).toEqual([
    { q: 'dune', category: 'movie', language: 'English' },
  ])
  expect(result.current.data).toEqual(body.data)
})

it('shares one request between the callers without params', async () => {
  const requests: URLSearchParams[] = []
  server.use(
    http.get('/api/v3/watchlist/facets', ({ request, response }) => {
      requests.push(new URL(request.url).searchParams)
      return response(200).json(makeWatchlistFacets())
    }),
  )
  const { result } = renderHook(
    () => [useWatchlistFacets(), useWatchlistFacets({})] as const,
    { wrapper: queryWrapper() },
  )

  await waitFor(() => expect(result.current[1].isSuccess).toBe(true))
  expect(result.current[0].isSuccess).toBe(true)
  expect(requests).toHaveLength(1)
})

it("keeps the previous counts while the next filter's load", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.get('/api/v3/watchlist/facets', async ({ request, response }) => {
      if (new URL(request.url).searchParams.get('q') === null) {
        return response(200).json(makeWatchlistFacets({ movie: 2 }))
      }
      await gate
      return response(200).json(makeWatchlistFacets({ movie: 1 }))
    }),
  )
  const { result, rerender } = renderHook(
    (params: WatchlistFacetsParams) => useWatchlistFacets(params),
    { wrapper: queryWrapper(), initialProps: {} as WatchlistFacetsParams },
  )
  await waitFor(() => expect(result.current.isSuccess).toBe(true))

  rerender({ q: 'dune' })

  expect(result.current.isPlaceholderData).toBe(true)
  expect(result.current.data?.total).toBe(2)

  release()
  await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
  expect(result.current.data?.total).toBe(1)
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

describe('useAddToWatchlist', () => {
  const dune = makeSearchResult({
    id: 'tt15239678',
    category: 'movie',
    title: 'Dune: Part Two',
  })
  const arrival = makeSearchResult({
    id: 'tt2543164',
    category: 'movie',
    title: 'Arrival',
  })
  const onScreen = { category: 'movie', q: 'dune' } as const
  const elsewhere = { category: 'game', q: 'elden' } as const

  /** Serves `onScreen`'s results, counting the searches. */
  function serveSearch() {
    const searches: string[] = []
    server.use(
      http.get('/api/v3/search', ({ request, response }) => {
        searches.push(new URL(request.url).search)
        return response(200).json({ data: [dune, arrival], meta: {} })
      }),
    )
    return searches
  }

  function seededQueryClient() {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(watchlistKeys.list({}), 'old list')
    queryClient.setQueryData(watchlistKeys.facets({}), 'old facets')
    queryClient.setQueryData(searchKeys.list(elsewhere), [
      makeSearchResult({ id: 'igdb:1', title: 'Elden Ring' }),
    ])
    return queryClient
  }

  function isInvalidated(
    queryClient: ReturnType<typeof createTestQueryClient>,
    queryKey: readonly unknown[],
  ) {
    return queryClient.getQueryState(queryKey)?.isInvalidated
  }

  /** The add mutation beside the search on screen, as in the sheet. */
  function renderAddWithSearch(
    queryClient: ReturnType<typeof createTestQueryClient>,
  ) {
    return renderHook(
      () => ({ search: useSearch(onScreen), add: useAddToWatchlist() }),
      { wrapper: queryWrapper(queryClient) },
    )
  }

  it('posts the item and returns the entry', async () => {
    const sent: unknown[] = []
    const entry = makeWatchlistEntry({ item: makeItem({ id: 'tt15239678' }) })
    server.use(
      http.post('/api/v3/watchlist', async ({ request, response }) => {
        sent.push(await request.json())
        return response(201).json({ data: entry, meta: {} })
      }),
    )
    const { result } = renderHook(() => useAddToWatchlist(), {
      wrapper: queryWrapper(),
    })

    const returned = await act(() =>
      result.current.mutateAsync({ item_id: 'tt15239678' }),
    )
    await act(() =>
      result.current.mutateAsync({
        item_id: 'tt15239678',
        added_at: '2025-01-01T00:00:00Z',
      }),
    )

    expect(sent).toEqual([
      { item_id: 'tt15239678' },
      { item_id: 'tt15239678', added_at: '2025-01-01T00:00:00Z' },
    ])
    expect(returned).toEqual(entry)
  })

  it('refetches the watchlist and counts and marks the search result without refetching it', async () => {
    const searches = serveSearch()
    const queryClient = seededQueryClient()
    const { result } = renderAddWithSearch(queryClient)
    await waitFor(() => expect(result.current.search.isSuccess).toBe(true))
    expect(searches).toHaveLength(1)

    await act(() => result.current.add.mutateAsync({ item_id: dune.id }))

    expect(isInvalidated(queryClient, watchlistKeys.list({}))).toBe(true)
    expect(isInvalidated(queryClient, watchlistKeys.facets({}))).toBe(true)
    expect(
      queryClient
        .getQueryData<SearchResult[]>(searchKeys.list(onScreen))
        ?.map((r) => [r.id, r.on_watchlist]),
    ).toEqual([
      [dune.id, true],
      [arrival.id, false],
    ])
    // The one on screen is fresh; the other search is only marked stale.
    expect(isInvalidated(queryClient, searchKeys.list(onScreen))).toBe(false)
    expect(isInvalidated(queryClient, searchKeys.list(elsewhere))).toBe(true)
    expect(
      queryClient.getQueryState(searchKeys.list(elsewhere))?.fetchStatus,
    ).toBe('idle')
    expect(searches).toHaveLength(1)
  })

  it('marks a result whose id is an alias of the stored one', async () => {
    serveSearch()
    server.use(
      http.post('/api/v3/watchlist', ({ response }) =>
        response(200).json({
          data: makeWatchlistEntry({ item: makeItem({ id: arrival.id }) }),
          meta: {},
        }),
      ),
    )
    const queryClient = createTestQueryClient()
    const { result } = renderAddWithSearch(queryClient)
    await waitFor(() => expect(result.current.search.isSuccess).toBe(true))

    await act(() => result.current.add.mutateAsync({ item_id: 'imdb-alias' }))

    await waitFor(() =>
      expect(
        result.current.search.data?.map((r) => [r.id, r.on_watchlist]),
      ).toEqual([
        [dune.id, false],
        [arrival.id, true],
      ]),
    )
  })

  it('changes nothing when the add fails', async () => {
    server.use(
      http.post('/api/v3/watchlist', ({ response }) =>
        response(409).json(
          makeProblem({
            status: 409,
            code: 'ALREADY_REVIEWED',
            title: 'Conflict',
            detail: 'Already reviewed.',
          }),
        ),
      ),
    )
    const queryClient = seededQueryClient()
    const { result } = renderHook(() => useAddToWatchlist(), {
      wrapper: queryWrapper(queryClient),
    })

    await act(async () => {
      await expect(
        result.current.mutateAsync({ item_id: dune.id }),
      ).rejects.toMatchObject({ status: 409, code: 'ALREADY_REVIEWED' })
    })

    expect(isInvalidated(queryClient, watchlistKeys.facets({}))).toBe(false)
    expect(isInvalidated(queryClient, searchKeys.list(elsewhere))).toBe(false)
  })
})

function deferredGate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

describe('useRemoveFromWatchlist', () => {
  const dune = makeWatchlistEntry({
    item: makeItem({ id: 'tt15239678', category: 'movie', title: 'Dune' }),
  })
  const frieren = makeWatchlistEntry({
    item: makeItem({ id: 'mal:52991', title: 'Frieren' }),
  })
  const arrival = makeWatchlistEntry({
    item: makeItem({ id: 'tt2543164', category: 'movie', title: 'Arrival' }),
  })
  const all = watchlistKeys.list({})
  const movies = watchlistKeys.list({ category: ['movie'] })

  function infinite(...pages: WatchlistPage[]): InfiniteData<WatchlistPage> {
    return { pages, pageParams: pages.map((_, i) => i * 20) }
  }

  /** All on two pages, and the movies, as the page would have cached them. */
  function seededQueryClient() {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(
      all,
      infinite(
        makeWatchlistPage([dune, frieren], { count: 3 }),
        makeWatchlistPage([arrival], { count: 3, offset: 2 }),
      ),
    )
    queryClient.setQueryData(
      movies,
      infinite(makeWatchlistPage([dune, arrival])),
    )
    queryClient.setQueryData(watchlistKeys.facets({}), makeWatchlistFacets())
    return queryClient
  }

  function cachedIds(
    queryClient: ReturnType<typeof createTestQueryClient>,
    queryKey: readonly unknown[],
  ) {
    return queryClient
      .getQueryData<InfiniteData<WatchlistPage>>(queryKey)
      ?.pages.flatMap((page) => ids(page))
  }

  function isInvalidated(
    queryClient: ReturnType<typeof createTestQueryClient>,
    queryKey: readonly unknown[],
  ) {
    return queryClient.getQueryState(queryKey)?.isInvalidated
  }

  /** Holds each DELETE until its id is released; records the ids. */
  function holdDeletes() {
    const sent: string[] = []
    const gates = new Map<string, () => void>()
    server.use(
      http.delete(
        '/api/v3/watchlist/{item_id}',
        async ({ params, response }) => {
          sent.push(params.item_id)
          await new Promise<void>((resolve) =>
            gates.set(params.item_id, resolve),
          )
          return response(204).empty()
        },
      ),
    )
    const release = (id: string) => gates.get(id)?.()
    return { sent, release, gates }
  }

  function renderRemove(queryClient = seededQueryClient()) {
    return renderHook(() => useRemoveFromWatchlist(), {
      wrapper: queryWrapper(queryClient),
    })
  }

  it('sends DELETE for the item and takes it out of every cached list at once', async () => {
    const { sent, release, gates } = holdDeletes()
    const queryClient = seededQueryClient()
    const { result } = renderRemove(queryClient)

    let removal!: Promise<void>
    act(() => {
      removal = result.current.mutateAsync(dune.item.id)
    })

    await waitFor(() => expect(gates.has(dune.item.id)).toBe(true))
    expect(sent).toEqual([dune.item.id])
    expect(cachedIds(queryClient, all)).toEqual([
      frieren.item.id,
      arrival.item.id,
    ])
    expect(cachedIds(queryClient, movies)).toEqual([arrival.item.id])

    release(dune.item.id)
    await act(() => removal)
  })

  it('leaves a list without the item as it was', async () => {
    const queryClient = seededQueryClient()
    const before = queryClient.getQueryData(movies)
    const { result } = renderRemove(queryClient)

    await act(() => result.current.mutateAsync(frieren.item.id))

    expect(queryClient.getQueryData(movies)).toBe(before)
  })

  it('counts a 404 as removed', async () => {
    server.use(
      http.delete('/api/v3/watchlist/{item_id}', ({ response }) =>
        response(404).json(makeProblem()),
      ),
    )
    const queryClient = seededQueryClient()
    const { result } = renderRemove(queryClient)

    await act(() => result.current.mutateAsync(dune.item.id))

    expect(cachedIds(queryClient, movies)).toEqual([arrival.item.id])
  })

  it('rejects any other failure with an ApiError and puts the lists back', async () => {
    server.use(
      http.delete('/api/v3/watchlist/{item_id}', ({ response }) =>
        response(500).json(
          makeProblem({ status: 500, code: 'SERVER_ERROR', title: 'Oops' }),
        ),
      ),
    )
    const queryClient = seededQueryClient()
    const { result } = renderRemove(queryClient)

    await act(async () => {
      const error = await result.current
        .mutateAsync(dune.item.id)
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status: 500 })
    })

    expect(cachedIds(queryClient, all)).toEqual([
      dune.item.id,
      frieren.item.id,
      arrival.item.id,
    ])
    expect(cachedIds(queryClient, movies)).toEqual([
      dune.item.id,
      arrival.item.id,
    ])
  })

  it('unmarks the cached search result without refetching, and refetches the watchlist and counts', async () => {
    const searches: string[] = []
    const onScreen = { category: 'movie', q: 'dune' } as const
    server.use(
      http.get('/api/v3/search', ({ request, response }) => {
        searches.push(new URL(request.url).search)
        return response(200).json({
          data: [
            makeSearchResult({ id: dune.item.id, on_watchlist: true }),
            makeSearchResult({ id: 'tt0816692', on_watchlist: true }),
          ],
          meta: {},
        })
      }),
    )
    const queryClient = seededQueryClient()
    const { result } = renderHook(
      () => ({ search: useSearch(onScreen), remove: useRemoveFromWatchlist() }),
      { wrapper: queryWrapper(queryClient) },
    )
    await waitFor(() => expect(result.current.search.isSuccess).toBe(true))

    await act(() => result.current.remove.mutateAsync(dune.item.id))

    expect(
      queryClient
        .getQueryData<SearchResult[]>(searchKeys.list(onScreen))
        ?.map((r) => [r.id, r.on_watchlist]),
    ).toEqual([
      [dune.item.id, false],
      ['tt0816692', true],
    ])
    expect(isInvalidated(queryClient, searchKeys.list(onScreen))).toBe(false)
    expect(searches).toHaveLength(1)
    expect(isInvalidated(queryClient, all)).toBe(true)
    expect(isInvalidated(queryClient, watchlistKeys.facets({}))).toBe(true)
  })

  it('puts back only its own card when one of two removes fails', async () => {
    const gates = new Map<string, () => void>()
    server.use(
      http.delete(
        '/api/v3/watchlist/{item_id}',
        async ({ params, response }) => {
          await new Promise<void>((resolve) =>
            gates.set(params.item_id, resolve),
          )
          return params.item_id === dune.item.id
            ? response.untyped(new HttpResponse(null, { status: 500 }))
            : response(204).empty()
        },
      ),
    )
    const queryClient = seededQueryClient()
    const { result } = renderRemove(queryClient)

    let first!: Promise<unknown>
    act(() => {
      first = result.current.mutateAsync(dune.item.id).catch((e) => e)
      void result.current.mutateAsync(arrival.item.id)
    })
    await waitFor(() => expect(gates.size).toBe(2))

    gates.get(dune.item.id)!()
    await act(() => first)

    expect(cachedIds(queryClient, all)).toEqual([dune.item.id, frieren.item.id])
    expect(cachedIds(queryClient, movies)).toEqual([dune.item.id])
    gates.get(arrival.item.id)!()
  })

  it('doesn’t hold up a list loading for the first time', async () => {
    const { release, gates } = holdDeletes()
    const games = deferredGate()
    server.use(
      http.get('/api/v3/watchlist', async ({ response }) => {
        await games.promise
        return response(200).json(makeWatchlistPage([]))
      }),
    )
    const queryClient = seededQueryClient()
    const { result } = renderHook(
      () => ({
        list: useWatchlist({ category: ['game'] }),
        remove: useRemoveFromWatchlist(),
      }),
      { wrapper: queryWrapper(queryClient) },
    )
    await waitFor(() => expect(result.current.list.isFetching).toBe(true))

    act(() => void result.current.remove.mutateAsync(dune.item.id))
    await waitFor(() => expect(gates.size).toBe(1))
    games.resolve()

    // While the remove is still in flight.
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    release(dune.item.id)
  })

  it('makes an add wait for the removes in flight before refetching', async () => {
    const { release, gates } = holdDeletes()
    const queryClient = seededQueryClient()
    const { result } = renderHook(
      () => ({ remove: useRemoveFromWatchlist(), add: useAddToWatchlist() }),
      { wrapper: queryWrapper(queryClient) },
    )

    let removal!: Promise<void>
    act(() => {
      removal = result.current.remove.mutateAsync(arrival.item.id)
    })
    await waitFor(() => expect(gates.size).toBe(1))
    await act(() =>
      result.current.add.mutateAsync({ item_id: frieren.item.id }),
    )
    expect(isInvalidated(queryClient, all)).toBe(false)
    expect(isInvalidated(queryClient, watchlistKeys.facets({}))).toBe(false)

    release(arrival.item.id)
    await act(() => removal)
    expect(isInvalidated(queryClient, all)).toBe(true)
    expect(isInvalidated(queryClient, watchlistKeys.facets({}))).toBe(true)
  })

  it('waits for the last of two removes before refetching', async () => {
    const { release, gates } = holdDeletes()
    const queryClient = seededQueryClient()
    const { result } = renderRemove(queryClient)

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.mutateAsync(dune.item.id)
      second = result.current.mutateAsync(arrival.item.id)
    })
    await waitFor(() => expect(gates.size).toBe(2))

    release(dune.item.id)
    await act(() => first)
    expect(isInvalidated(queryClient, all)).toBe(false)
    expect(isInvalidated(queryClient, watchlistKeys.facets({}))).toBe(false)
    expect(cachedIds(queryClient, all)).toEqual([frieren.item.id])

    release(arrival.item.id)
    await act(() => second)
    expect(isInvalidated(queryClient, all)).toBe(true)
    expect(isInvalidated(queryClient, watchlistKeys.facets({}))).toBe(true)
  })
})
