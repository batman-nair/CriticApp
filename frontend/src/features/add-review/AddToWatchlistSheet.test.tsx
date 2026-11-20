import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay } from 'msw'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { authKeys } from '../../api/queries/auth'
import type { SearchResult } from '../../api/types'
import type {
  WatchlistAddState,
  WatchlistOutlet,
} from '../../lib/watchlistOutlet'
import { expectNoAxeViolations } from '../../test/axe'
import {
  makeItem,
  makeProblem,
  makeSearchResult,
  makeWatchlistEntry,
} from '../../test/fixtures'
import { http } from '../../test/handlers'
import { createTestQueryClient } from '../../test/render'
import { server } from '../../test/server'
import { AddToWatchlistSheet } from './AddToWatchlistSheet'

afterEach(() => {
  localStorage.clear()
})

const movie = (id: string, title: string, overrides = {}) =>
  makeSearchResult({
    id,
    category: 'movie',
    title,
    start_year: 2021,
    genres: ['Sci-Fi'],
    ...overrides,
  })

const dune = movie('tt1160419', 'Dune')
const arrival = movie('tt2543164', 'Arrival', { start_year: 2016 })
const blade = movie('tt1856101', 'Blade Runner 2049', { start_year: 2017 })
const watched = movie('tt0816692', 'Interstellar', {
  start_year: 2014,
  my_review: { id: 4, rating: 9.4 },
})
const saved = movie('tt0083658', 'Blade Runner', {
  start_year: 1982,
  on_watchlist: true,
})

/** Answers every search with `results`, recording each query. */
function serveSearch(results: SearchResult[]) {
  const requests: Record<string, string>[] = []
  server.use(
    http.get('/api/v3/search', ({ request }) => {
      requests.push(Object.fromEntries(new URL(request.url).searchParams))
      return Response.json({ data: results, meta: {} })
    }),
  )
  return requests
}

/** Records each add's body; answers with `respond` when given. */
function serveAdds(respond?: (itemId: string) => Response | Promise<Response>) {
  const sent: unknown[] = []
  server.use(
    http.post('/api/v3/watchlist', async ({ request }) => {
      const body = await request.json()
      sent.push(body)
      if (respond) return respond(body.item_id)
      return Response.json(
        {
          data: makeWatchlistEntry({ item: makeItem({ id: body.item_id }) }),
          meta: {},
        },
        { status: 201 },
      )
    }),
  )
  return sent
}

function problem(status: number, code: string) {
  return Response.json(
    makeProblem({ title: 'Error', status, code, detail: 'Failed.' }),
    { status },
  )
}

/** The sheet over a stand-in page that hands it `onAdded`. */
function renderSheet(state?: Partial<WatchlistAddState> | null) {
  const onAdded = vi.fn()
  const router = createMemoryRouter(
    [
      {
        path: '/watchlist',
        element: (
          <>
            <p>The page</p>
            <Outlet
              context={
                {
                  onAdded,
                  entries: [],
                  entriesPending: false,
                } satisfies WatchlistOutlet
              }
            />
          </>
        ),
        children: [{ path: 'add', element: <AddToWatchlistSheet /> }],
      },
    ],
    {
      initialEntries: [
        '/watchlist',
        {
          pathname: '/watchlist/add',
          state: state === undefined ? { fromParent: true } : state,
        },
      ],
      initialIndex: 1,
    },
  )
  const queryClient = createTestQueryClient()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...view, router, queryClient, onAdded }
}

async function openSheet(state?: Partial<WatchlistAddState> | null) {
  const view = renderSheet(state)
  const dialog = await screen.findByRole('dialog', { name: 'Add to watchlist' })
  return { ...view, dialog }
}

const searchbox = (name = 'Search movies') =>
  screen.getByRole('searchbox', { name })
const status = () =>
  within(screen.getByRole('dialog')).getAllByRole('status').at(-1)!

async function search(user: ReturnType<typeof userEvent.setup>, q = 'dune') {
  await user.type(searchbox(), q)
}

it('opens on Movies, describing itself, with nothing added yet', async () => {
  const { dialog } = await openSheet()

  expect(dialog).toHaveAccessibleDescription(
    'Tap a title to save it. Add as many as you like.',
  )
  expect(searchbox()).toHaveAttribute('placeholder', 'Search movies…')
  expect(screen.getByText('Search for a title to add it.')).toBeInTheDocument()
  expect(status()).toHaveTextContent('Nothing added yet')
  expect(
    screen.queryByRole('list', { name: 'Add review steps' }),
  ).not.toBeInTheDocument()
})

it('starts on the category in the link state', async () => {
  await openSheet({ fromParent: true, category: 'anime' })

  expect(
    await screen.findByRole('searchbox', { name: 'Search anime' }),
  ).toBeInTheDocument()
})

it('starts on Movies when the link state has an unknown category', async () => {
  await openSheet({ fromParent: true, category: 'anime:movie' as never })

  expect(searchbox()).toBeInTheDocument()
})

it('starts on Movies without link state', async () => {
  await openSheet(null)

  expect(searchbox()).toBeInTheDocument()
})

it('neither reads nor writes the add flow’s remembered category', async () => {
  const user = userEvent.setup()
  localStorage.setItem('critic-add-category', 'book')
  await openSheet()

  expect(searchbox()).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: 'Games' }))

  expect(searchbox('Search games')).toBeInTheDocument()
  expect(localStorage.getItem('critic-add-category')).toBe('book')
})

it('adds a tapped title and keeps the sheet open', async () => {
  const user = userEvent.setup()
  serveSearch([dune, arrival])
  const sent = serveAdds()
  const { onAdded } = await openSheet()

  await search(user)
  await user.click(
    await screen.findByRole('button', {
      name: 'Add Dune (2021) to your watchlist',
    }),
  )

  const row = await screen.findByRole('button', {
    name: 'Dune (2021) is on your watchlist',
  })
  expect(row).toHaveAttribute('aria-disabled', 'true')
  expect(row).toHaveAttribute('data-fresh')
  await waitFor(() =>
    expect(status()).toHaveTextContent('Dune added to your watchlist'),
  )
  expect(within(status()).getByText('Dune added')).toBeInTheDocument()
  expect(sent).toEqual([{ item_id: dune.id }])
  expect(onAdded).toHaveBeenCalledWith(dune.id)
  expect(screen.getByRole('dialog')).toBeInTheDocument()

  await user.click(
    screen.getByRole('button', {
      name: 'Add Arrival (2016) to your watchlist',
    }),
  )
  await waitFor(() =>
    expect(
      within(status()).getByText('2 titles added to your watchlist'),
    ).toBeInTheDocument(),
  )
  expect(within(status()).getByText('2 titles added')).toBeInTheDocument()
})

it('tells the page the stored id, not an alias', async () => {
  const user = userEvent.setup()
  serveSearch([dune])
  serveAdds(() =>
    Response.json(
      {
        data: makeWatchlistEntry({ item: makeItem({ id: 'tt-stored' }) }),
        meta: {},
      },
      { status: 201 },
    ),
  )
  const { onAdded } = await openSheet()

  await search(user)
  await user.click(await screen.findByRole('button', { name: /^Add Dune/ }))

  await waitFor(() => expect(onAdded).toHaveBeenCalledWith('tt-stored'))
})

it('sends one add for a double tap', async () => {
  const user = userEvent.setup()
  serveSearch([dune])
  const sent = serveAdds(async (itemId) => {
    await delay(50)
    return Response.json(
      {
        data: makeWatchlistEntry({ item: makeItem({ id: itemId }) }),
        meta: {},
      },
      { status: 201 },
    )
  })
  await openSheet()

  await search(user)
  const add = await screen.findByRole('button', { name: /^Add Dune/ })
  await user.dblClick(add)

  await waitFor(() =>
    expect(status()).toHaveTextContent('Dune added to your watchlist'),
  )
  expect(sent).toHaveLength(1)
})

it('counts a title that was already on the list (200) as added', async () => {
  const user = userEvent.setup()
  serveSearch([dune])
  serveAdds((itemId) =>
    Response.json(
      {
        data: makeWatchlistEntry({ item: makeItem({ id: itemId }) }),
        meta: {},
      },
      { status: 200 },
    ),
  )
  await openSheet()

  await search(user)
  await user.click(await screen.findByRole('button', { name: /^Add Dune/ }))

  await waitFor(() =>
    expect(status()).toHaveTextContent('Dune added to your watchlist'),
  )
  expect(
    screen.getByRole('button', { name: 'Dune (2021) is on your watchlist' }),
  ).toBeInTheDocument()
})

it('shows results on the list or reviewed as inert', async () => {
  const user = userEvent.setup()
  serveSearch([watched, saved])
  const sent = serveAdds()
  await openSheet()

  await search(user, 'interstellar')
  const reviewed = await screen.findByRole('button', {
    name: 'Interstellar (2014): already reviewed, 9.4',
  })
  const onList = screen.getByRole('button', {
    name: 'Blade Runner (1982) is on your watchlist',
  })
  expect(onList).not.toHaveAttribute('data-fresh')
  expect(within(reviewed).getByText('Reviewed · 9.4')).toBeInTheDocument()

  await user.click(reviewed)
  await user.click(onList)

  expect(sent).toEqual([])
  expect(status()).toHaveTextContent('Nothing added yet')
})

it('turns a title reviewed meanwhile (409) into Reviewed, not counted', async () => {
  const user = userEvent.setup()
  serveSearch([dune])
  serveAdds(() => problem(409, 'ALREADY_REVIEWED'))
  const { onAdded } = await openSheet()

  await search(user)
  await user.click(await screen.findByRole('button', { name: /^Add Dune/ }))

  const row = await screen.findByRole('button', {
    name: 'Dune (2021): already reviewed',
  })
  expect(row).toHaveAttribute('aria-disabled', 'true')
  expect(row).not.toHaveAttribute('data-fresh')
  expect(status()).toHaveTextContent('Nothing added yet')
  expect(onAdded).not.toHaveBeenCalled()
})

it('makes a failed title tappable again, with a message', async () => {
  const user = userEvent.setup()
  serveSearch([dune, blade])
  let fail = true
  const sent = serveAdds((itemId) =>
    fail
      ? problem(500, 'SERVER_ERROR')
      : Response.json(
          {
            data: makeWatchlistEntry({ item: makeItem({ id: itemId }) }),
            meta: {},
          },
          { status: 201 },
        ),
  )
  await openSheet()

  await search(user)
  await user.click(await screen.findByRole('button', { name: /^Add Dune/ }))

  await waitFor(() =>
    expect(status()).toHaveTextContent('Couldn’t add Dune. Try again.'),
  )
  expect(status()).toHaveAttribute('data-tone', 'error')
  fail = false
  await user.click(screen.getByRole('button', { name: /^Add Dune/ }))

  await waitFor(() =>
    expect(status()).toHaveTextContent('Dune added to your watchlist'),
  )
  expect(sent).toHaveLength(2)
})

it('marks the session expired on a 401', async () => {
  const user = userEvent.setup()
  serveSearch([dune])
  serveAdds(() => problem(401, 'UNAUTHENTICATED'))
  const { queryClient } = await openSheet()

  await search(user)
  await user.click(await screen.findByRole('button', { name: /^Add Dune/ }))

  await waitFor(() =>
    expect(queryClient.getQueryData(authKeys.session())).toEqual({
      user: null,
    }),
  )
  expect(screen.getByRole('button', { name: /^Add Dune/ })).not.toHaveAttribute(
    'aria-disabled',
  )
})

it('closes with Done, back to the page', async () => {
  const user = userEvent.setup()
  const { router } = await openSheet()

  await user.click(screen.getByRole('button', { name: 'Done' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/watchlist'))
  expect(router.state.historyAction).toBe('POP')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('has no axe violations with results', async () => {
  const user = userEvent.setup()
  serveSearch([dune, watched, saved])
  await openSheet()

  await search(user)
  await screen.findByRole('button', { name: /^Add Dune/ })

  await expectNoAxeViolations(screen.getByRole('dialog'))
})
