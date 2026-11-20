import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  WatchlistEntry,
  WatchlistPage as WatchlistPageData,
} from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import {
  makeItem,
  makeSearchResult,
  makeWatchlistEntry,
  makeWatchlistFacets,
  makeWatchlistPage,
} from '../../test/fixtures'
import { defaultWatchlist, http } from '../../test/handlers'
import { stubIntersectionObserver } from '../../test/intersectionObserver'
import { stubSystemTheme } from '../../test/matchMedia'
import { createTestQueryClient } from '../../test/render'
import { renderRoute } from '../../test/renderRoute'
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

/** The page's own live region, not the toast's. */
function pageStatus() {
  const results = document.querySelector<HTMLElement>(`.${styles.results}`)
  return within(results!).getByRole('status')
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

  expect(pageStatus()).toHaveTextContent('Loading your watchlist')
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
    expect(pageStatus()).toHaveTextContent('Loading your watchlist'),
  )
  await new Promise((done) => setTimeout(done, 20))
  expect(
    screen.queryByRole('heading', { name: /^No .* on your watchlist$/ }),
  ).not.toBeInTheDocument()
  // Still the first-load skeletons, not chips that go away again.
  expect(chips()).toBeNull()

  gate.resolve()
  expect(
    await screen.findByRole('heading', {
      name: 'Nothing on your watchlist yet',
    }),
  ).toBeInTheDocument()
  expect(chips()).toBeNull()
})

it('shows the empty state for an empty list under All, whatever the counts say', async () => {
  // Counts from before the last entry was removed elsewhere.
  serveList(() => makeWatchlistPage([]))
  serveFacets({ movie: 3 })
  renderPage()

  expect(
    await screen.findByRole('heading', {
      name: 'Nothing on your watchlist yet',
    }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Show all' }),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Nothing saved yet.')).toBeInTheDocument()
})

it('leaves out a chip the page can’t filter by', async () => {
  server.use(
    http.get('/api/v3/watchlist/facets', ({ response }) =>
      response(200).json(
        makeWatchlistFacets(
          {},
          {
            total: 2,
            categories: [
              { id: 'movie', count: 1 },
              { id: 'podcast', count: 1 },
            ],
          },
        ),
      ),
    ),
  )
  renderPage()

  await waitFor(() => expect(chip('Movies')).toHaveAccessibleName('Movies 1'))
  expect(within(chips()!).getAllByRole('button')).toHaveLength(2)
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
  const status = pageStatus()
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

describe('with the add sheet, on the real routes', () => {
  beforeEach(() => {
    // The header's theme toggle reads the system theme.
    stubSystemTheme('light')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete document.documentElement.dataset.theme
  })

  const sheet = () => screen.findByRole('dialog', { name: 'Add to watchlist' })
  const game = makeWatchlistEntry({
    item: makeItem({ id: 'igdb:1', category: 'game', title: 'Hollow Knight' }),
  })
  const dune = makeSearchResult({
    id: 'tt1160419',
    category: 'movie',
    title: 'Dune',
    start_year: 2021,
  })

  /**
   * A watchlist that starts with `entries` (every category gets them all)
   * and grows with each add; searches find Dune.
   */
  function serveWatchlist(entries: WatchlistEntry[]) {
    const list = [...entries]
    server.use(
      http.get('/api/v3/watchlist', ({ response }) =>
        response(200).json(makeWatchlistPage(list)),
      ),
      http.get('/api/v3/watchlist/facets', ({ response }) =>
        response(200).json(
          makeWatchlistFacets({ game: 1 }, { total: list.length }),
        ),
      ),
      http.post('/api/v3/watchlist', async ({ request, response }) => {
        const { item_id } = await request.json()
        const entry = makeWatchlistEntry({
          item: makeItem({ id: item_id, category: 'movie', title: 'Dune' }),
        })
        list.unshift(entry)
        return response(201).json({ data: entry, meta: {} })
      }),
      http.get('/api/v3/search', ({ response }) =>
        response(200).json({ data: [dune], meta: {} }),
      ),
    )
  }

  async function addDune(user: ReturnType<typeof userEvent.setup>) {
    await user.type(
      screen.getByRole('searchbox', { name: 'Search movies' }),
      'dune',
    )
    await user.click(await screen.findByRole('button', { name: /^Add Dune/ }))
    await screen.findByText('Dune added to your watchlist')
  }

  it('opens the sheet from the hero, over the page and its filter', async () => {
    const user = userEvent.setup()
    serveWatchlist([game])
    const { router } = renderRoute('/watchlist?category=game')

    await user.click(
      await screen.findByRole('link', { name: 'Add to watchlist' }),
    )

    expect(await sheet()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/watchlist/add')
    expect(router.state.location.search).toBe('?category=game')
    expect(
      screen.getByRole('searchbox', { name: 'Search movies' }),
    ).toBeInTheDocument()
  })

  it('opens the sheet from the empty state', async () => {
    const user = userEvent.setup()
    serveWatchlist([])
    renderRoute('/watchlist')

    await user.click(
      await screen.findByRole('link', { name: 'Add your first title' }),
    )

    expect(await sheet()).toBeInTheDocument()
  })

  it('opens the sheet on Anime from an empty anime series chip', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/v3/watchlist', ({ request, response }) =>
        response(200).json(
          makeWatchlistPage(
            new URL(request.url).searchParams.get('category')
              ? []
              : defaultWatchlist,
          ),
        ),
      ),
      http.get('/api/v3/watchlist/facets', ({ response }) =>
        response(200).json(makeWatchlistFacets({ movie: 2 })),
      ),
    )
    renderRoute('/watchlist?category=anime:series')

    await user.click(
      await screen.findByRole('link', { name: 'Add an anime series' }),
    )

    expect(await sheet()).toBeInTheDocument()
    expect(
      await screen.findByRole('searchbox', { name: 'Search anime' }),
    ).toBeInTheDocument()
  })

  it('outlines what was added and shows All, in place of the filtered entry, after Done', async () => {
    const user = userEvent.setup()
    serveWatchlist([game])
    const { router } = renderRoute('/watchlist?category=game')
    await user.click(
      await screen.findByRole('link', { name: 'Add to watchlist' }),
    )
    await sheet()

    await addDune(user)
    // Not while the sheet is open.
    expect(router.state.location.search).toBe('?category=game')
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(router.state.location.pathname).toBe('/watchlist')
    // The page's entry was written over, not added to.
    expect(router.state.historyAction).toBe('REPLACE')
    const added = await screen.findByRole('article', { name: 'Dune' })
    expect(added).toHaveAttribute('data-fresh')
    expect(
      screen.getByRole('article', { name: 'Hollow Knight' }),
    ).not.toHaveAttribute('data-fresh')

    // A chip picked now stays picked.
    await user.click(chip('Games'))
    await waitFor(() =>
      expect(router.state.location.search).toBe('?category=game'),
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(router.state.location.search).toBe('?category=game')
  })

  it('clears the outlines when the sheet opens again', async () => {
    const user = userEvent.setup()
    serveWatchlist([game])
    renderRoute('/watchlist')
    await user.click(
      await screen.findByRole('link', { name: 'Add to watchlist' }),
    )
    await sheet()
    await addDune(user)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(
      await screen.findByRole('article', { name: 'Dune' }),
    ).toHaveAttribute('data-fresh')

    await user.click(screen.getByRole('link', { name: 'Add to watchlist' }))
    await sheet()

    expect(
      screen.getByRole('article', { name: 'Dune', hidden: true }),
    ).not.toHaveAttribute('data-fresh')
  })

  it('leaves the filter alone when nothing was added', async () => {
    const user = userEvent.setup()
    serveWatchlist([game])
    const { router } = renderRoute('/watchlist?category=game')
    await user.click(
      await screen.findByRole('link', { name: 'Add to watchlist' }),
    )
    await sheet()

    await user.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/watchlist'),
    )
    expect(router.state.location.search).toBe('?category=game')
    expect(router.state.historyAction).toBe('POP')
  })
})

describe('Remove and Undo', () => {
  const movie = (id: string, title: string, added_at: string) =>
    makeWatchlistEntry({
      item: makeItem({ id, category: 'movie', title }),
      added_at,
    })
  const dune = movie('tt1160419', 'Dune', '2025-03-03T00:00:00Z')
  const arrival = movie('tt2543164', 'Arrival', '2025-03-02T00:00:00Z')
  const heat = movie('tt0113277', 'Heat', '2025-03-01T00:00:00Z')

  interface Options {
    /** Each DELETE waits for it. */
    deleteGate?: Promise<void>
    deleteStatus?: 404 | 500
    postStatus?: 500
  }

  /**
   * A watchlist server that keeps its entries newest first, removes on
   * DELETE and adds on POST, recording each write in order.
   */
  function serveWatchlist(initial: WatchlistEntry[], options: Options = {}) {
    let list = [...initial]
    const writes: string[] = []
    const posts: unknown[] = []
    const sorted = () =>
      [...list].sort((a, b) => b.added_at.localeCompare(a.added_at))
    server.use(
      http.get('/api/v3/watchlist', ({ response }) =>
        response(200).json(makeWatchlistPage(sorted())),
      ),
      http.get('/api/v3/watchlist/facets', ({ response }) =>
        response(200).json(makeWatchlistFacets({ movie: list.length })),
      ),
      http.delete(
        '/api/v3/watchlist/{item_id}',
        async ({ params, response }) => {
          writes.push(`DELETE ${params.item_id}`)
          await options.deleteGate
          if (options.deleteStatus === 404) {
            // Removed elsewhere already.
            list = list.filter((entry) => entry.item.id !== params.item_id)
          }
          if (options.deleteStatus) {
            return response.untyped(
              new HttpResponse(null, { status: options.deleteStatus }),
            )
          }
          list = list.filter((entry) => entry.item.id !== params.item_id)
          return response(204).empty()
        },
      ),
      http.post('/api/v3/watchlist', async ({ request, response }) => {
        const body = await request.json()
        writes.push(`POST ${body.item_id}`)
        posts.push(body)
        if (options.postStatus) {
          return response.untyped(
            new HttpResponse(null, { status: options.postStatus }),
          )
        }
        const entry = initial.find((e) => e.item.id === body.item_id)!
        const added = { ...entry, added_at: body.added_at ?? entry.added_at }
        list.push(added)
        return response(201).json({ data: added, meta: {} })
      }),
    )
    return { writes, posts }
  }

  /** The toast's live region, not the page's own. */
  function toast() {
    const results = document.querySelector(`.${styles.results}`)!
    return screen
      .getAllByRole('status')
      .find((region) => !results.contains(region))!
  }

  const titles = () =>
    cards().map((card) => within(card).getByRole('heading').textContent)

  const removeButton = (title: string) =>
    screen.getByRole('button', { name: `Remove ${title} from your watchlist` })

  it('takes the card off at once and says so, with Undo', async () => {
    const user = userEvent.setup()
    const gate = deferred()
    const { writes } = serveWatchlist([dune, arrival, heat], {
      deleteGate: gate.promise,
    })
    renderPage()
    await waitForCards(3)

    await user.click(removeButton('Arrival'))

    await waitFor(() => expect(titles()).toEqual(['Dune', 'Heat']))
    expect(toast()).toHaveTextContent('Removed Arrival from your watchlist.')
    expect(
      within(toast()).getByRole('button', { name: 'Undo' }),
    ).toBeInTheDocument()
    expect(writes).toEqual([`DELETE ${arrival.item.id}`])

    gate.resolve()
    expect(await screen.findByText('2 titles to watch, play or read later.'))
    expect(titles()).toEqual(['Dune', 'Heat'])
  })

  it('puts it back in its place with Undo, with the original date', async () => {
    const user = userEvent.setup()
    const { posts } = serveWatchlist([dune, arrival, heat])
    renderPage()
    await waitForCards(3)

    await user.click(removeButton('Arrival'))
    await screen.findByText('2 titles to watch, play or read later.')
    await user.click(within(toast()).getByRole('button', { name: 'Undo' }))

    await waitFor(() => expect(titles()).toEqual(['Dune', 'Arrival', 'Heat']))
    expect(posts).toEqual([
      { item_id: arrival.item.id, added_at: arrival.added_at },
    ])
    expect(toast()).toBeEmptyDOMElement()
    expect(
      await screen.findByText('3 titles to watch, play or read later.'),
    ).toBeInTheDocument()
    expect(chip('All')).toHaveAccessibleName('All 3')
  })

  it('waits for the remove to finish before Undo puts it back', async () => {
    const user = userEvent.setup()
    const gate = deferred()
    const { writes } = serveWatchlist([dune, arrival], {
      deleteGate: gate.promise,
    })
    renderPage()
    await waitForCards(2)

    await user.click(removeButton('Arrival'))
    await user.click(within(toast()).getByRole('button', { name: 'Undo' }))
    await new Promise((done) => setTimeout(done, 20))
    expect(writes).toEqual([`DELETE ${arrival.item.id}`])

    gate.resolve()
    await waitFor(() =>
      expect(writes).toEqual([
        `DELETE ${arrival.item.id}`,
        `POST ${arrival.item.id}`,
      ]),
    )
    await waitFor(() => expect(titles()).toEqual(['Dune', 'Arrival']))
  })

  it('counts a title already gone as removed', async () => {
    const user = userEvent.setup()
    serveWatchlist([dune, arrival], { deleteStatus: 404 })
    renderPage()
    await waitForCards(2)

    await user.click(removeButton('Arrival'))
    // Settled: the counts refetched.
    await screen.findByText('1 title to watch, play or read later.')

    expect(titles()).toEqual(['Dune'])
    expect(toast()).toHaveTextContent('Removed Arrival from your watchlist.')
    expect(screen.queryByText(/Couldn’t/)).not.toBeInTheDocument()
  })

  it('brings the card back and says so when the remove fails', async () => {
    const user = userEvent.setup()
    serveWatchlist([dune, arrival, heat], { deleteStatus: 500 })
    renderPage()
    await waitForCards(3)

    await user.click(removeButton('Arrival'))

    await waitFor(() =>
      expect(toast()).toHaveTextContent('Couldn’t remove Arrival. Try again.'),
    )
    expect(within(toast()).queryByRole('button')).not.toBeInTheDocument()
    expect(titles()).toEqual(['Dune', 'Arrival', 'Heat'])
  })

  it('says so when Undo fails', async () => {
    const user = userEvent.setup()
    serveWatchlist([dune, arrival], { postStatus: 500 })
    renderPage()
    await waitForCards(2)

    await user.click(removeButton('Arrival'))
    await user.click(within(toast()).getByRole('button', { name: 'Undo' }))

    await waitFor(() =>
      expect(toast()).toHaveTextContent(
        'Couldn’t put Arrival back on your watchlist.',
      ),
    )
    expect(titles()).toEqual(['Dune'])
  })

  it('shows the empty state after the last card, with the toast still up', async () => {
    const user = userEvent.setup()
    serveWatchlist([dune])
    renderPage()
    await waitForCards(1)

    await user.click(removeButton('Dune'))

    expect(
      await screen.findByRole('link', { name: 'Add your first title' }),
    ).toBeInTheDocument()
    expect(toast()).toHaveTextContent('Removed Dune from your watchlist.')
    await user.click(within(toast()).getByRole('button', { name: 'Undo' }))
    await waitForCards(1)
  })

  describe('timing and focus', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const setupUser = () =>
      userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

    it('closes after 6 seconds after a click, which leaves focus alone', async () => {
      const user = setupUser()
      serveWatchlist([dune, arrival])
      renderPage()
      await waitForCards(2)

      await user.click(removeButton('Arrival'))
      await waitFor(() => expect(titles()).toEqual(['Dune']))
      expect(toast()).not.toContainElement(
        document.activeElement as HTMLElement,
      )

      wait(5900)
      expect(toast()).toHaveTextContent('Removed Arrival')
      wait(100)
      expect(toast()).toBeEmptyDOMElement()
    })

    it('replaces the toast, and its time, on the next Remove', async () => {
      const user = setupUser()
      serveWatchlist([dune, arrival, heat])
      renderPage()
      await waitForCards(3)

      await user.click(removeButton('Arrival'))
      wait(4000)
      await user.click(removeButton('Heat'))

      expect(toast()).toHaveTextContent('Removed Heat from your watchlist.')
      expect(toast()).not.toHaveTextContent('Arrival')
      wait(4000)
      expect(toast()).toHaveTextContent('Removed Heat')
      wait(2000)
      expect(toast()).toBeEmptyDOMElement()
    })

    it('moves focus to Undo after Remove from the keyboard; Enter undoes', async () => {
      const user = setupUser()
      const { posts } = serveWatchlist([dune, arrival])
      renderPage()
      await waitForCards(2)

      removeButton('Arrival').focus()
      await user.keyboard('{Enter}')

      const undo = within(toast()).getByRole('button', { name: 'Undo' })
      await waitFor(() => expect(undo).toHaveFocus())
      // Paused while focus is in it.
      wait(10000)
      expect(toast()).toHaveTextContent('Removed Arrival')

      await user.keyboard('{Enter}')
      await waitFor(() => expect(titles()).toEqual(['Dune', 'Arrival']))
      expect(posts).toHaveLength(1)
      // Not dropped to <body>.
      expect(document.querySelector(`.${styles.results}`)).toHaveFocus()
    })
  })
})

describe('Remove with a sheet, on the real routes', () => {
  beforeEach(() => {
    stubSystemTheme('light')
  })

  afterEach(() => {
    delete document.documentElement.dataset.theme
  })

  it('dismisses the toast when the add sheet opens; the removal stays', async () => {
    const user = userEvent.setup()
    const deletes: string[] = []
    server.use(
      http.delete('/api/v3/watchlist/{item_id}', ({ params, response }) => {
        deletes.push(params.item_id)
        return response(204).empty()
      }),
    )
    renderRoute('/watchlist')
    await waitForCards(2)
    const [first] = defaultWatchlist

    await user.click(
      screen.getByRole('button', {
        name: `Remove ${first!.item.title} from your watchlist`,
      }),
    )
    expect(screen.getByText(/^Removed/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Add to watchlist' }))
    await screen.findByRole('dialog', { name: 'Add to watchlist' })

    expect(screen.queryByText(/^Removed/)).not.toBeInTheDocument()
    expect(deletes).toEqual([first!.item.id])
  })
})
