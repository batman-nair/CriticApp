import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Item } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeItem, makeProblem } from '../../test/fixtures'
import { http } from '../../test/handlers'
import { stubSystemTheme } from '../../test/matchMedia'
import { renderRoute } from '../../test/renderRoute'
import { server } from '../../test/server'

// The header's theme toggle reads the system theme.
beforeEach(() => {
  stubSystemTheme('light')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete document.documentElement.dataset.theme
})

type Served = Item | 'missing' | 'error'

/** Serves /api/v3/items/{item_id} from `respond`, recording each id. */
function serveItem(respond: (id: string) => Served) {
  const ids: string[] = []
  server.use(
    http.get('/api/v3/items/{item_id}', ({ params, response }) => {
      ids.push(params.item_id)
      const served = respond(params.item_id)
      if (served === 'missing') return response(404).json(makeProblem())
      if (served === 'error') {
        return response.untyped(new HttpResponse(null, { status: 500 }))
      }
      return response(200).json({ data: served, meta: {} })
    }),
  )
  return { ids }
}

const dialog = () => screen.getByRole('dialog')

/** A card's title link on the page, behind any dialog. */
const cardLink = (title: string) =>
  screen.getByRole('link', { name: title, hidden: true })

async function openFromCard(title: string) {
  const user = userEvent.setup()
  const view = renderRoute('/watchlist?sort=title')
  await user.click(await screen.findByRole('link', { name: title }))
  await screen.findByRole('dialog')
  return { user, ...view }
}

it('opens a card’s details over the page, without asking for the item', async () => {
  const { ids } = serveItem(() => 'error')
  const { router } = await openFromCard('Dune: Part Two')

  expect(router.state.location.pathname).toBe('/watchlist/items/tt15239678')
  expect(router.state.location.search).toBe('?sort=title')
  expect(
    screen.getByRole('dialog', { name: 'Dune: Part Two' }),
  ).toBeInTheDocument()
  expect(
    within(dialog()).getByRole('heading', { level: 2, name: 'Dune: Part Two' }),
  ).toBeInTheDocument()
  expect(within(dialog()).getByText('Movie · 2024')).toBeInTheDocument()
  // The day itself depends on the time zone the test runs in.
  expect(dialog().querySelector('time')).toHaveAttribute(
    'datetime',
    '2025-04-02T12:00:00Z',
  )
  expect(
    await within(dialog()).findByText('IMDb', { selector: 'dt' }),
  ).toBeInTheDocument()
  expect(ids).toEqual([])
})

it('goes back to the page on Close, focusing the card it opened from', async () => {
  const { user, router } = await openFromCard('Dune: Part Two')

  await user.click(screen.getByRole('button', { name: 'Close' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/watchlist'))
  expect(router.state.location.search).toBe('?sort=title')
  expect(router.state.historyAction).toBe('POP')
  await waitFor(() => expect(cardLink('Dune: Part Two')).toHaveFocus())
})

it('shows a listed title from a direct link, with the date it was added', async () => {
  const { ids } = serveItem(() => 'error')
  renderRoute('/watchlist/items/mal%3A52991')

  expect(
    await screen.findByRole('dialog', {
      name: 'Frieren: Beyond Journey’s End',
    }),
  ).toBeInTheDocument()
  expect(dialog().querySelector('time')).toHaveAttribute(
    'datetime',
    '2025-04-01T12:00:00Z',
  )
  // Tinted as the card is.
  expect(dialog().style.getPropertyValue('--cat-base')).toBe(
    'var(--cat-anime-series-base)',
  )
  expect(ids).toEqual([])
})

it('fetches a title the list hasn’t loaded, showing a skeleton until it comes', async () => {
  const { ids } = serveItem((id) =>
    makeItem({ id, title: 'Hollow Knight', category: 'game' }),
  )
  renderRoute('/watchlist/items/igdb%3A1')

  expect(
    await within(await screen.findByRole('dialog')).findByRole('heading', {
      level: 2,
      name: 'Hollow Knight',
    }),
  ).toBeInTheDocument()
  expect(ids).toEqual(['igdb:1'])
  // Not known without the entry.
  expect(within(dialog()).queryByText('Added')).not.toBeInTheDocument()
})

it('says a missing title is not found, and goes back from there', async () => {
  serveItem(() => 'missing')
  const user = userEvent.setup()
  const { router } = renderRoute('/watchlist/items/igdb%3A99?sort=title')

  expect(
    await screen.findByRole('dialog', { name: 'Title not found' }),
  ).toBeInTheDocument()

  await user.click(
    screen.getByRole('button', { name: 'Back to the watchlist' }),
  )

  await waitFor(() => expect(router.state.location.pathname).toBe('/watchlist'))
  expect(router.state.location.search).toBe('?sort=title')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('shows an error, and the title after "Try again"', async () => {
  let fail = true
  serveItem((id) => (fail ? 'error' : makeItem({ id, title: 'Celeste' })))
  const user = userEvent.setup()
  renderRoute('/watchlist/items/igdb%3A2')

  expect(
    await within(await screen.findByRole('dialog')).findByRole('alert'),
  ).toHaveTextContent('Couldn’t load this title.')

  fail = false
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(
    await screen.findByRole('dialog', { name: 'Celeste' }),
  ).toBeInTheDocument()
})

it('opens Review it in its place, so closing that goes back to the page', async () => {
  const { user, router } = await openFromCard('Dune: Part Two')

  await user.click(within(dialog()).getByRole('link', { name: 'Review it' }))

  expect(
    await screen.findByRole('dialog', { name: 'Rate it' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/watchlist/review/tt15239678')
  expect(router.state.location.search).toBe('?sort=title')
  expect(router.state.historyAction).toBe('REPLACE')

  await user.click(screen.getByRole('button', { name: 'Close' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/watchlist'))
  expect(router.state.location.search).toBe('?sort=title')
  // The details' Review it is gone, so focus goes to the card instead.
  await waitFor(() => expect(cardLink('Dune: Part Two')).toHaveFocus())
})

it('has no axe violations', async () => {
  await openFromCard('Dune: Part Two')
  await within(dialog()).findByText('IMDb', { selector: 'dt' })

  await expectNoAxeViolations(dialog())
})
