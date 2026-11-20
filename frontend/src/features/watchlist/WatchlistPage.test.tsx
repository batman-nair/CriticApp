import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import type { WatchlistPage as WatchlistPageData } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import {
  makeItem,
  makeWatchlistEntry,
  makeWatchlistFacets,
  makeWatchlistPage,
} from '../../test/fixtures'
import { http } from '../../test/handlers'
import { stubIntersectionObserver } from '../../test/intersectionObserver'
import { createTestQueryClient } from '../../test/render'
import { server } from '../../test/server'
import { WatchlistPage } from './WatchlistPage'
import styles from './WatchlistPage.module.css'

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage(path = '/watchlist') {
  const router = createMemoryRouter(
    [{ path: '/watchlist', element: <WatchlistPage /> }],
    { initialEntries: [path] },
  )
  return {
    router,
    ...render(
      <QueryClientProvider client={createTestQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  }
}

function entries(count: number, firstId = 1) {
  return Array.from({ length: count }, (_, i) => {
    const id = firstId + i
    return makeWatchlistEntry({
      item: makeItem({ id: `mal:${id}`, title: `Title ${id}` }),
    })
  })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

type Served = WatchlistPageData | 'error'

/**
 * Serves each request what `respond` gives for its category and offset, after
 * `gate` when there is one, and records each request.
 */
function serveList(
  respond: (category: string | null, offset: number) => Served,
  gate?: Promise<void>,
) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get('/api/v3/watchlist', async ({ request, response }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      await gate
      const served = respond(
        params.get('category'),
        Number(params.get('offset')),
      )
      if (served === 'error') {
        return response.untyped(new HttpResponse(null, { status: 500 }))
      }
      return response(200).json(served)
    }),
  )
  return { requests }
}

function serveFacets(
  counts: Record<string, number> | 'error',
  gate?: Promise<void>,
) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get('/api/v3/watchlist/facets', async ({ request, response }) => {
      requests.push(new URL(request.url).searchParams)
      await gate
      if (counts === 'error') {
        return response.untyped(new HttpResponse(null, { status: 500 }))
      }
      return response(200).json(makeWatchlistFacets(counts))
    }),
  )
  return { requests }
}

function cards() {
  return screen.queryAllByRole('article')
}

async function waitForCards(count: number) {
  await waitFor(() => expect(cards()).toHaveLength(count))
}

function chips() {
  return screen.queryByRole('group', { name: 'Filter by category' })
}

/** A chip by its label, with or without a count. */
const chip = (label: string) =>
  within(chips()!).getByRole('button', {
    name: new RegExp(`^${label}( \\d+)?$`),
  })

it('shows the entries in the server’s order, with the category and years', async () => {
  renderPage()

  await waitForCards(2)
  const [first, second] = cards()
  expect(first).toHaveAccessibleName('Dune: Part Two')
  expect(within(first!).getByText('Movie · 2024')).toBeInTheDocument()
  expect(second).toHaveAccessibleName('Frieren: Beyond Journey’s End')
  expect(
    within(second!).getByText('Anime series · 2023–2024'),
  ).toBeInTheDocument()
  expect(screen.getByText('Newest first')).toBeInTheDocument()
})

it('shows the hero', async () => {
  renderPage()

  expect(
    screen.getByRole('heading', { level: 1, name: 'Up next.' }),
  ).toBeInTheDocument()
  expect(screen.getByText(/only you can see this/).textContent?.trim()).toBe(
    'Your watchlist · only you can see this',
  )
  expect(
    await screen.findByText('2 titles to watch, play or read later.'),
  ).toBeInTheDocument()
})

it('counts a single title in the singular', async () => {
  serveList(() => makeWatchlistPage(entries(1)))
  serveFacets({ game: 1 })
  renderPage()

  expect(
    await screen.findByText('1 title to watch, play or read later.'),
  ).toBeInTheDocument()
})

it('shows each chip with its count, the anime split in two', async () => {
  serveFacets({ movie: 2, 'anime:series': 3, 'anime:movie': 1 })
  renderPage()

  await waitFor(() => expect(chip('All')).toHaveAccessibleName('All 6'))
  expect(chip('All')).toHaveAttribute('aria-pressed', 'true')
  expect(chip('Movies')).toHaveAccessibleName('Movies 2')
  expect(chip('Anime series')).toHaveAccessibleName('Anime series 3')
  expect(chip('Anime movies')).toHaveAccessibleName('Anime movies 1')
  expect(chip('Books')).toHaveAccessibleName('Books 0')
  expect(within(chips()!).getAllByRole('button')).toHaveLength(8)
})

it('filters by the chip picked, in the URL', async () => {
  const user = userEvent.setup()
  const { requests } = serveList((category) =>
    category === 'game'
      ? makeWatchlistPage([
          makeWatchlistEntry({
            item: makeItem({ id: 'igdb:1', category: 'game', title: 'Hades' }),
          }),
        ])
      : makeWatchlistPage(entries(2)),
  )
  serveFacets({ game: 1, movie: 1 })
  const { router } = renderPage('/watchlist?sort=x')
  await waitForCards(2)

  await user.click(chip('Games'))

  await waitForCards(1)
  expect(cards()[0]).toHaveAccessibleName('Hades')
  expect(chip('Games')).toHaveAttribute('aria-pressed', 'true')
  expect(chip('All')).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByText('Games · newest first')).toBeInTheDocument()
  expect(
    Object.fromEntries(new URLSearchParams(router.state.location.search)),
  ).toEqual({ sort: 'x', category: 'game' })
  expect(requests.map((params) => params.get('category'))).toEqual([
    null,
    'game',
  ])
})

it('selects the URL’s category on the first load', async () => {
  const { requests } = serveList(() => makeWatchlistPage(entries(1)))
  renderPage('/watchlist?category=anime:movie')

  await waitForCards(1)
  expect(chip('Anime movies')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('Anime movies · newest first')).toBeInTheDocument()
  expect(requests[0]?.get('category')).toBe('anime:movie')
})

it.each(['bogus', 'anime', 'movie,game'])(
  'shows All for ?category=%s',
  async (value) => {
    const { requests } = serveList(() => makeWatchlistPage(entries(2)))
    renderPage(`/watchlist?category=${value}`)

    await waitForCards(2)
    expect(chip('All')).toHaveAttribute('aria-pressed', 'true')
    expect(requests[0]?.has('category')).toBe(false)
  },
)

it('shows skeletons in the hero, the chips and the grid until the first page', async () => {
  const gate = deferred()
  serveList(() => makeWatchlistPage(entries(2)), gate.promise)
  serveFacets({ movie: 2 }, gate.promise)
  const { container } = renderPage()

  expect(screen.getByRole('status')).toHaveTextContent('Loading your watchlist')
  expect(
    container.querySelector(`.${styles.subtitleSkeleton}`),
  ).toBeInTheDocument()
  expect(
    container.querySelector(`.${styles.ghostChips}`)?.childElementCount,
  ).toBe(8)
  expect(chips()).toBeNull()

  gate.resolve()
  await waitForCards(2)
  expect(screen.queryByText('Loading your watchlist')).not.toBeInTheDocument()
  expect(container.querySelector(`.${styles.subtitleSkeleton}`)).toBeNull()
  expect(container.querySelector(`.${styles.ghostChips}`)).toBeNull()
})

it('shows the error, then the list after "Try again"', async () => {
  const user = userEvent.setup()
  serveList(() => 'error')
  serveFacets('error')
  renderPage()

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Couldn’t load your watchlist')
  expect(
    screen.getByText('Things to watch, play and read later.'),
  ).toBeInTheDocument()
  expect(chips()).toBeNull()

  // Hold the retry, to see what shows while it runs.
  const gate = deferred()
  serveList(() => makeWatchlistPage(entries(2)), gate.promise)
  const facets = serveFacets({ movie: 2 })
  await user.click(within(alert).getByRole('button', { name: 'Try again' }))

  expect(await screen.findByText('Loading your watchlist')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  gate.resolve()
  await waitForCards(2)
  // The failed counts are asked for again too.
  expect(facets.requests).toHaveLength(1)
  expect(
    await screen.findByText('2 titles to watch, play or read later.'),
  ).toBeInTheDocument()
})

it('shows the empty state without chips', async () => {
  serveList(() => makeWatchlistPage([]))
  serveFacets({})
  renderPage()

  expect(
    await screen.findByRole('heading', {
      name: 'Nothing on your watchlist yet',
    }),
  ).toBeInTheDocument()
  expect(screen.getByText('Nothing saved yet.')).toBeInTheDocument()
  expect(chips()).toBeNull()
  expect(screen.queryByText('Newest first')).not.toBeInTheDocument()
})

it('shows the empty state, never "no matches", for a category on an empty watchlist', async () => {
  const gate = deferred()
  serveList(() => makeWatchlistPage([]))
  serveFacets({}, gate.promise)
  renderPage('/watchlist?category=movie')

  // The list is in, the counts aren't.
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading your watchlist',
    ),
  )
  await new Promise((done) => setTimeout(done, 20))
  expect(
    screen.queryByRole('heading', { name: /^No .* on your watchlist$/ }),
  ).not.toBeInTheDocument()

  gate.resolve()
  expect(
    await screen.findByRole('heading', {
      name: 'Nothing on your watchlist yet',
    }),
  ).toBeInTheDocument()
  expect(chips()).toBeNull()
})

it('shows "no matches" for an empty category, and the list after "Show all"', async () => {
  const user = userEvent.setup()
  serveList((category) =>
    category === 'series'
      ? makeWatchlistPage([])
      : makeWatchlistPage(entries(7)),
  )
  serveFacets({ movie: 4, game: 3 })
  const { router } = renderPage('/watchlist?category=series')

  expect(
    await screen.findByRole('heading', { name: 'No series on your watchlist' }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Your other 7 titles are under All.'),
  ).toBeInTheDocument()
  expect(chip('Series')).toHaveAttribute('aria-pressed', 'true')

  await user.click(screen.getByRole('button', { name: 'Show all' }))

  await waitForCards(7)
  expect(router.state.location.search).toBe('')
  expect(chip('All')).toHaveAttribute('aria-pressed', 'true')
})

it('shows skeletons, not "no matches", leaving an empty category', async () => {
  const user = userEvent.setup()
  serveList(() => makeWatchlistPage([]))
  serveFacets({ movie: 2, game: 1 })
  renderPage('/watchlist?category=series')
  await screen.findByRole('heading', { name: 'No series on your watchlist' })

  const gate = deferred()
  serveList(() => makeWatchlistPage(entries(1, 10)), gate.promise)
  await user.click(chip('Games'))

  expect(await screen.findByText('Loading your watchlist')).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: /^No .* on your watchlist$/ }),
  ).not.toBeInTheDocument()
  expect(chip('Games')).toHaveAttribute('aria-pressed', 'true')

  gate.resolve()
  await waitForCards(1)
})

it('keeps the cards on screen while the next category loads', async () => {
  const user = userEvent.setup()
  const gate = deferred()
  serveList((category) =>
    category === 'game'
      ? makeWatchlistPage(entries(1, 10))
      : makeWatchlistPage(entries(2)),
  )
  const { container } = renderPage()
  await waitForCards(2)

  serveList(() => makeWatchlistPage(entries(1, 10)), gate.promise)
  await user.click(chip('Games'))

  const results = container.querySelector(`.${styles.results}`)
  await waitFor(() => expect(results).toHaveAttribute('aria-busy', 'true'))
  expect(cards()).toHaveLength(2)

  gate.resolve()
  await waitForCards(1)
  expect(results).not.toHaveAttribute('aria-busy')
})

it('keeps the chips and the count when a chip fails later, until another is picked', async () => {
  const user = userEvent.setup()
  serveList((category) =>
    category === 'book' ? 'error' : makeWatchlistPage(entries(2)),
  )
  renderPage()
  await waitForCards(2)

  await user.click(chip('Books'))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Couldn’t load your watchlist',
  )
  expect(cards()).toHaveLength(0)
  expect(chip('Books')).toHaveAttribute('aria-pressed', 'true')
  expect(
    screen.getByText('2 titles to watch, play or read later.'),
  ).toBeInTheDocument()

  await user.click(chip('All'))

  await waitForCards(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('uses the list’s count when the counts fail, and the chips still filter', async () => {
  const user = userEvent.setup()
  serveList((category) =>
    category === 'movie'
      ? makeWatchlistPage(entries(1))
      : makeWatchlistPage(entries(3), { count: 3 }),
  )
  serveFacets('error')
  renderPage()
  await waitForCards(3)

  expect(
    await screen.findByText('3 titles to watch, play or read later.'),
  ).toBeInTheDocument()
  expect(chip('All')).toHaveAccessibleName('All 3')
  expect(chip('Movies')).toHaveAccessibleName('Movies')

  await user.click(chip('Movies'))

  await waitForCards(1)
  // A category's count isn't the total.
  expect(
    screen.getByText('Things to watch, play and read later.'),
  ).toBeInTheDocument()
})

it('loads the next page when the end of the list comes near', async () => {
  const io = stubIntersectionObserver()
  const gate = deferred()
  const { requests } = serveList((_category, offset) =>
    offset === 0
      ? makeWatchlistPage(entries(20), { count: 25 })
      : makeWatchlistPage(entries(5, 21), { count: 25, offset: 20 }),
  )
  renderPage()
  await waitForCards(20)
  const status = screen.getByRole('status')
  expect(status).toBeEmptyDOMElement()

  // Hold the second page, to see the status while it loads.
  serveList(
    () => makeWatchlistPage(entries(5, 21), { count: 25, offset: 20 }),
    gate.promise,
  )
  io.setIntersecting(true)

  await waitFor(() => expect(status).toHaveTextContent('Loading more…'))
  io.setIntersecting(false)
  gate.resolve()
  await waitForCards(25)
  expect(status).toBeEmptyDOMElement()
  expect(requests.map((params) => params.get('offset'))).toEqual(['0'])
})

it('shows a title repeated on the next page once', async () => {
  const io = stubIntersectionObserver()
  serveList((_category, offset) =>
    offset === 0
      ? makeWatchlistPage(entries(20), { count: 22 })
      : makeWatchlistPage(entries(2, 20), { count: 22, offset: 20 }),
  )
  renderPage()
  await waitForCards(20)

  io.setIntersecting(true)

  await waitForCards(21)
})

it('keeps the cards when the next page fails, and retries it inline', async () => {
  const user = userEvent.setup()
  const io = stubIntersectionObserver()
  serveList((_category, offset) =>
    offset === 0 ? makeWatchlistPage(entries(20), { count: 40 }) : 'error',
  )
  renderPage()
  await waitForCards(20)

  io.setIntersecting(true)

  expect(
    await screen.findByText('Couldn’t load more titles.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(cards()).toHaveLength(20)

  serveList(() => makeWatchlistPage(entries(20, 21), { count: 40, offset: 20 }))
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  await waitForCards(40)
  expect(
    screen.queryByText('Couldn’t load more titles.'),
  ).not.toBeInTheDocument()
})

it.each([
  ['ready', () => {}, () => waitForCards(2)],
  [
    'empty',
    () => {
      serveList(() => makeWatchlistPage([]))
      serveFacets({})
    },
    () => screen.findByText('Nothing on your watchlist yet'),
  ],
  [
    'error',
    () => {
      serveList(() => 'error')
    },
    () => screen.findByRole('alert'),
  ],
])('has no axe violations when %s', async (_state, setup, ready) => {
  setup()
  const { container } = renderPage()
  await ready()

  await expectNoAxeViolations(container)
})
