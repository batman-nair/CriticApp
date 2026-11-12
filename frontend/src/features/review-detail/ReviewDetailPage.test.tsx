import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Review } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeProblem, makeReviewFacets } from '../../test/fixtures'
import { defaultReviews, http } from '../../test/handlers'
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

const HERO = 'Everything I’ve watched, played and read.'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

type Served = Review | 'missing' | 'error'

/**
 * Serves /api/v3/reviews/{id} from `respond` after `gate` when there is one,
 * and records each id asked for. The facets, which the same path matches,
 * get the default counts.
 */
function serveReview(respond: (id: number) => Served, gate?: Promise<void>) {
  const ids: number[] = []
  server.use(
    http.get('/api/v3/reviews/{id}', async ({ params, response }) => {
      if (params.id === 'facets') {
        return response.untyped(HttpResponse.json(makeReviewFacets()))
      }
      const id = Number(params.id)
      ids.push(id)
      await gate
      const served = respond(id)
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
const cardLink = (title: string) =>
  within(screen.getByRole('list')).getByRole('link', { name: title })

async function openFromCard(title: string) {
  const user = userEvent.setup()
  const view = renderRoute('/?sort=title')
  await user.click(await screen.findByRole('link', { name: title }))
  await screen.findByRole('dialog')
  return { user, ...view }
}

it('shows the review over the list from a direct link', async () => {
  renderRoute('/reviews/1')

  expect(
    await screen.findByRole('dialog', { name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  expect(
    within(dialog()).getByRole('heading', { level: 2, name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  // Behind the dialog, so outside the accessibility tree.
  expect(
    screen.getByRole('heading', { level: 1, name: HERO, hidden: true }),
  ).toBeInTheDocument()
  expect(
    await screen.findByRole('link', { name: 'The Matrix', hidden: true }),
  ).toBeInTheDocument()
})

it('shows a skeleton until a direct link’s review loads', async () => {
  const gate = deferred()
  serveReview(() => defaultReviews[0]!, gate.promise)
  renderRoute('/reviews/1')

  expect(within(dialog()).getByRole('status')).toHaveTextContent(
    'Loading the review',
  )
  expect(screen.getByRole('dialog', { name: 'Review' })).toBeInTheDocument()

  gate.resolve()
  expect(
    await within(dialog()).findByRole('heading', { name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  expect(screen.queryByText('Loading the review')).not.toBeInTheDocument()
})

it('tints the dialog with the review’s category', async () => {
  renderRoute('/reviews/1')

  await screen.findByRole('dialog', { name: 'Cowboy Bebop' })
  expect(dialog().style.getPropertyValue('--cat-base')).toBe(
    'var(--cat-anime-series-base)',
  )
})

it('closes to the list with the filters on Esc, replacing a direct link', async () => {
  const user = userEvent.setup()
  const { router } = renderRoute('/reviews/1?sort=title')
  await screen.findByRole('dialog', { name: 'Cowboy Bebop' })

  await user.keyboard('{Escape}')

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('?sort=title')
  expect(router.state.historyAction).toBe('REPLACE')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('closes on the browser’s Back', async () => {
  const { router } = await openFromCard('The Matrix')

  await act(() => router.navigate(-1))

  expect(router.state.location.pathname).toBe('/')
  expect(router.state.location.search).toBe('?sort=title')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
})

it('goes back to the list after opening from a card', async () => {
  const { user, router } = await openFromCard('The Matrix')
  expect(router.state.location.pathname).toBe('/reviews/2')

  await user.click(screen.getByRole('button', { name: 'Close' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('?sort=title')
  expect(router.state.historyAction).toBe('POP')
  await waitFor(() => expect(cardLink('The Matrix')).toHaveFocus())
})

it('shows a listed review at once, without a skeleton', async () => {
  const gate = deferred()
  const { ids } = serveReview(() => defaultReviews[0]!, gate.promise)
  await openFromCard('Cowboy Bebop')

  expect(
    within(dialog()).getByRole('heading', { level: 2, name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  expect(screen.queryByText('Loading the review')).not.toBeInTheDocument()
  expect(
    await within(dialog()).findByText('MyAnimeList', { selector: 'dt' }),
  ).toBeInTheDocument()
  // Still asked for, so a review deleted elsewhere shows as missing.
  await waitFor(() => expect(ids).toEqual([1]))
  gate.resolve()
})

it('says a missing review is not found, and goes back from there', async () => {
  const user = userEvent.setup()
  const { router } = renderRoute('/reviews/99?sort=title')

  expect(
    await within(await screen.findByRole('dialog')).findByRole('heading', {
      name: 'Review not found',
    }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('dialog', { name: 'Review not found' }),
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Back to the list' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('?sort=title')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('says an id that isn’t one is not found, without asking', async () => {
  const { ids } = serveReview(() => defaultReviews[0]!)
  renderRoute('/reviews/abc')

  expect(
    within(await screen.findByRole('dialog')).getByRole('heading', {
      name: 'Review not found',
    }),
  ).toBeInTheDocument()
  await screen.findByRole('link', { name: 'The Matrix', hidden: true })
  expect(ids).toEqual([])
})

it('shows an error, and the review after "Try again"', async () => {
  const user = userEvent.setup()
  let failing = true
  const { ids } = serveReview(() => (failing ? 'error' : defaultReviews[0]!))
  renderRoute('/reviews/1')

  const alert = await within(await screen.findByRole('dialog')).findByRole(
    'alert',
  )
  expect(alert).toHaveTextContent('Couldn’t load this review.')

  failing = false
  await user.click(within(alert).getByRole('button', { name: 'Try again' }))

  expect(
    await within(dialog()).findByRole('heading', { name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(ids).toEqual([1, 1])
})

it('has no axe violations', async () => {
  renderRoute('/reviews/1')
  await screen.findByRole('dialog', { name: 'Cowboy Bebop' })
  await within(dialog()).findByText('MyAnimeList', { selector: 'dt' })

  // Not document.body: axe's region rule misfires on portaled content.
  await expectNoAxeViolations(dialog())
}, 30_000)
