import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import type { WatchlistEntry } from '../../api/types'
import { makeItem, makeProblem, makeWatchlistEntry } from '../../test/fixtures'
import { http } from '../../test/handlers'
import { createTestQueryClient } from '../../test/render'
import { server } from '../../test/server'
import { itemToSearchResult, useWatchlistStart } from './watchlistStart'

afterEach(() => server.events.removeAllListeners())

const frieren = makeItem({
  id: 'mal:52991',
  title: 'Frieren: Beyond Journey’s End',
  start_year: 2023,
  end_year: 2024,
  genres: ['Adventure', 'Fantasy'],
  provider_rating: 9.3,
})

function recordItemRequests() {
  const paths: string[] = []
  server.events.on('request:start', ({ request }) => {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/v3/items/')) paths.push(pathname)
  })
  return paths
}

/** The hook in a child route of a page that hands it `entries`. */
function renderStart(
  itemId: string | undefined,
  {
    entries = [],
    entriesPending = false,
    active = true,
  }: {
    entries?: WatchlistEntry[]
    entriesPending?: boolean
    active?: boolean
  } = {},
) {
  const queryClient = createTestQueryClient()
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Routes>
            <Route
              element={
                <Outlet
                  context={{ onAdded: vi.fn(), entries, entriesPending }}
                />
              }
            >
              <Route index element={children} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
  return renderHook(
    ({ active }: { active: boolean }) => useWatchlistStart(itemId, active),
    { wrapper: Wrapper, initialProps: { active } },
  )
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

it('turns an item into the flow’s result, on the watchlist and unreviewed', () => {
  expect(itemToSearchResult(frieren)).toEqual({
    id: 'mal:52991',
    category: 'anime',
    title: 'Frieren: Beyond Journey’s End',
    image_url: 'https://cdn.example.com/cowboy-bebop.jpg',
    start_year: 2023,
    end_year: 2024,
    genres: ['Adventure', 'Fantasy'],
    provider_rating: 9.3,
    my_review: null,
    on_watchlist: true,
  })
})

it('is none without an id, and asks for nothing', async () => {
  const requests = recordItemRequests()
  const { result } = renderStart(undefined)

  expect(result.current).toMatchObject({ status: 'none', onWatchlist: false })
  await settle()
  expect(requests).toEqual([])
})

it('is ready at once with a loaded card’s title, without a request', async () => {
  const requests = recordItemRequests()
  const { result } = renderStart('mal:52991', {
    entries: [makeWatchlistEntry({ item: frieren })],
  })

  expect(result.current).toMatchObject({
    status: 'ready',
    item: itemToSearchResult(frieren),
    onWatchlist: true,
  })
  await settle()
  expect(requests).toEqual([])
})

it('fetches a title the page hasn’t loaded, not known to be on the list', async () => {
  const requests = recordItemRequests()
  const { result } = renderStart('igdb:1942', {
    entries: [makeWatchlistEntry({ item: frieren })],
  })

  expect(result.current.status).toBe('loading')
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.item).toMatchObject({ id: 'igdb:1942' })
  expect(result.current.onWatchlist).toBe(false)
  expect(requests).toEqual(['/api/v3/items/igdb%3A1942'])
})

it('is not-found on a 404', async () => {
  server.use(
    http.get('/api/v3/items/{item_id}', ({ response }) =>
      response(404).json(makeProblem()),
    ),
  )
  const { result } = renderStart('mal:404')

  await waitFor(() => expect(result.current.status).toBe('not-found'))
})

it('is error on a 500, and retry fetches again', async () => {
  let fail = true
  server.use(
    http.get('/api/v3/items/{item_id}', ({ params, response }) =>
      fail
        ? response(500).json(makeProblem({ status: 500 }))
        : response(200).json({
            data: makeItem({ id: params.item_id }),
            meta: {},
          }),
    ),
  )
  const { result } = renderStart('mal:1')
  await waitFor(() => expect(result.current.status).toBe('error'))

  fail = false
  act(() => result.current.retry())

  await waitFor(() => expect(result.current.status).toBe('ready'))
})

it('asks for nothing while inactive', async () => {
  const requests = recordItemRequests()
  const { result } = renderStart('igdb:1942', { active: false })

  await settle()
  expect(result.current.status).toBe('loading')
  expect(requests).toEqual([])
})

it('waits for the page’s first load instead of fetching the title', async () => {
  const requests = recordItemRequests()
  const { result } = renderStart('mal:52991', { entriesPending: true })

  await settle()
  expect(result.current).toMatchObject({
    status: 'loading',
    onWatchlist: false,
  })
  expect(requests).toEqual([])
})
