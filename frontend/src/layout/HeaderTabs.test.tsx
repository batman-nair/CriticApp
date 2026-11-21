import { render, screen, waitFor, within } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { watchlistKeys } from '../api/queries/watchlist'
import { expectNoAxeViolations } from '../test/axe'
import { makeWatchlistFacets } from '../test/fixtures'
import { http } from '../test/handlers'
import { createTestQueryClient, queryWrapper } from '../test/render'
import { server } from '../test/server'
import { HeaderTabs } from './HeaderTabs'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

function renderTabs(path = '/', queryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HeaderTabs />
    </MemoryRouter>,
    { wrapper: queryWrapper(queryClient) },
  )
}

function serveFacets(
  counts: Record<string, number> | 'error',
  gate?: Promise<void>,
) {
  server.use(
    http.get('/api/v3/watchlist/facets', async ({ response }) => {
      await gate
      if (counts === 'error') {
        return response.untyped(new HttpResponse(null, { status: 500 }))
      }
      return response(200).json(makeWatchlistFacets(counts))
    }),
  )
}

async function findTabs() {
  return screen.findByRole('navigation', { name: 'Main' })
}

function reviewsTab() {
  return screen.getByRole('link', { name: 'Reviews' })
}

function watchlistTab() {
  return screen.getByRole('link', { name: /^Watchlist/ })
}

describe('as the owner', () => {
  it('links both tabs, marks Reviews on the list and counts the watchlist', async () => {
    renderTabs('/')
    const nav = await findTabs()

    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/watchlist',
    ])
    expect(reviewsTab()).toHaveAttribute('aria-current', 'page')
    expect(
      await screen.findByRole('link', { name: 'Watchlist 2' }),
    ).toHaveAttribute('href', '/watchlist')
    expect(watchlistTab()).not.toHaveAttribute('aria-current')
  })

  it.each(['/watchlist?category=movie', '/watchlist/add'])(
    'marks Watchlist at %s',
    async (path) => {
      renderTabs(path)
      await findTabs()
      expect(watchlistTab()).toHaveAttribute('aria-current', 'page')
      expect(reviewsTab()).not.toHaveAttribute('aria-current')
    },
  )

  it.each(['/reviews/5', '/add?q=dune'])(
    'marks Reviews at %s',
    async (path) => {
      renderTabs(path)
      await findTabs()
      expect(reviewsTab()).toHaveAttribute('aria-current', 'page')
      expect(watchlistTab()).not.toHaveAttribute('aria-current')
    },
  )

  it('marks neither tab on another page', async () => {
    renderTabs('/does-not-exist')
    await findTabs()
    expect(reviewsTab()).not.toHaveAttribute('aria-current')
    expect(watchlistTab()).not.toHaveAttribute('aria-current')
  })

  it('shows no count while the facets load', async () => {
    const gate = deferred()
    serveFacets({ movie: 3 }, gate.promise)
    renderTabs()
    await findTabs()
    expect(screen.getByRole('link', { name: 'Watchlist' })).toBeInTheDocument()

    gate.resolve()

    expect(
      await screen.findByRole('link', { name: 'Watchlist 3' }),
    ).toBeInTheDocument()
  })

  it('shows no count when the watchlist is empty', async () => {
    serveFacets({})
    const queryClient = createTestQueryClient()
    renderTabs('/', queryClient)
    await findTabs()
    await waitFor(() =>
      expect(queryClient.getQueryState(watchlistKeys.facets({}))?.status).toBe(
        'success',
      ),
    )
    expect(screen.getByRole('link', { name: 'Watchlist' })).toBeInTheDocument()
  })

  it('shows no count when the facets fail', async () => {
    serveFacets('error')
    const queryClient = createTestQueryClient()
    renderTabs('/', queryClient)
    await findTabs()
    await waitFor(() =>
      expect(queryClient.getQueryState(watchlistKeys.facets({}))?.status).toBe(
        'error',
      ),
    )
    expect(screen.getByRole('link', { name: 'Watchlist' })).toBeInTheDocument()
  })

  it('updates the count when the watchlist changes', async () => {
    const queryClient = createTestQueryClient()
    renderTabs('/', queryClient)
    await screen.findByRole('link', { name: 'Watchlist 2' })

    serveFacets({ movie: 2, game: 1 })
    await queryClient.invalidateQueries({ queryKey: watchlistKeys.all })

    expect(
      await screen.findByRole('link', { name: 'Watchlist 3' }),
    ).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderTabs()
    await screen.findByRole('link', { name: 'Watchlist 2' })
    await expectNoAxeViolations(container)
  })
})

it('renders nothing while the session loads', () => {
  renderTabs()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})
