import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Review, ReviewPage } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import {
  finishExitAnimation,
  settle,
  stubExitAnimation,
} from '../../test/dialogAnimation'
import {
  makeItem,
  makeProblem,
  makeReview,
  makeReviewFacets,
  makeReviewPage,
} from '../../test/fixtures'
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

function reviews(count: number, firstId = 1) {
  return Array.from({ length: count }, (_, i) => {
    const id = firstId + i
    return makeReview({ id, item: makeItem({ title: `Title ${id}` }) })
  })
}

/**
 * Serves the list's pages by offset, each after its gate when it has one, and
 * every listed review at /api/v3/reviews/{id}. Records the offsets asked for.
 */
function serveShelf(
  pages: Record<number, ReviewPage>,
  gates: Record<number, Promise<void>> = {},
) {
  const offsets: string[] = []
  server.use(
    http.get('/api/v3/reviews', async ({ request, response }) => {
      const offset = Number(new URL(request.url).searchParams.get('offset'))
      offsets.push(String(offset))
      const page = pages[offset]
      if (!page) throw new Error(`No page at ${offset}`)
      await gates[offset]
      return response(200).json(page)
    }),
  )
  const listed = Object.values(pages).flatMap((page) => page.data)
  serveReview((id) => listed.find((review) => review.id === id) ?? 'missing')
  return { offsets }
}

const dialog = () => screen.getByRole('dialog')
const previousButton = () =>
  screen.getByRole('button', { name: /^Previous review/ })
const nextButton = () => screen.getByRole('button', { name: /^Next review/ })
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

it('says a listed review deleted elsewhere is not found', async () => {
  serveReview(() => 'missing')
  await openFromCard('Cowboy Bebop')

  expect(
    await within(dialog()).findByRole('heading', { name: 'Review not found' }),
  ).toBeInTheDocument()
})

it('says a review deleted since it was loaded is not found', async () => {
  let deleted = false
  serveReview(() => (deleted ? 'missing' : defaultReviews[0]!))
  const { queryClient } = renderRoute('/reviews/1')
  expect(
    await within(await screen.findByRole('dialog')).findByRole('heading', {
      name: 'Cowboy Bebop',
    }),
  ).toBeInTheDocument()

  deleted = true
  await act(() => queryClient.refetchQueries({ queryKey: ['reviews'] }))

  expect(
    await within(dialog()).findByRole('heading', { name: 'Review not found' }),
  ).toBeInTheDocument()
})

it('steps with ‹ › in place, and closes back to the list at once', async () => {
  serveShelf({ 0: makeReviewPage(reviews(3)) })
  const { user, router } = await openFromCard('Title 1')

  await user.click(screen.getByRole('button', { name: 'Next review: Title 2' }))

  expect(router.state.location.pathname).toBe('/reviews/2')
  expect(router.state.location.search).toBe('?sort=title')
  expect(router.state.location.state).toEqual({ fromParent: true })
  expect(router.state.historyAction).toBe('REPLACE')
  expect(screen.getByRole('dialog', { name: 'Title 2' })).toBeInTheDocument()
  expect(
    within(dialog()).getByRole('heading', { level: 2, name: 'Title 2' }),
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Next review: Title 3' }))
  await user.click(
    screen.getByRole('button', { name: 'Previous review: Title 2' }),
  )
  await user.click(nextButton())
  expect(router.state.location.pathname).toBe('/reviews/3')

  await user.click(screen.getByRole('button', { name: 'Close' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('?sort=title')
  expect(router.state.historyAction).toBe('POP')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('returns focus to the card it opened from, after stepping', async () => {
  serveShelf({ 0: makeReviewPage(reviews(3)) })
  const { user } = await openFromCard('Title 1')

  await user.click(nextButton())
  await user.click(nextButton())
  await user.keyboard('{Escape}')

  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  await waitFor(() => expect(cardLink('Title 1')).toHaveFocus())
})

it('does nothing past either end of a list with no more pages', async () => {
  serveShelf({ 0: makeReviewPage(reviews(2)) })
  const { user, router } = await openFromCard('Title 1')

  expect(previousButton()).toHaveAttribute('aria-disabled', 'true')
  await user.click(previousButton())
  expect(router.state.location.pathname).toBe('/reviews/1')

  await user.click(nextButton())
  expect(router.state.location.pathname).toBe('/reviews/2')
  expect(nextButton()).toHaveAttribute('aria-disabled', 'true')
  expect(previousButton()).not.toHaveAttribute('aria-disabled')

  await user.click(nextButton())
  expect(router.state.location.pathname).toBe('/reviews/2')
  expect(nextButton()).toHaveFocus()
})

it('loads the next page from the last loaded review, then steps to it', async () => {
  const gate = deferred()
  const { offsets } = serveShelf(
    {
      0: makeReviewPage(reviews(2), { count: 3 }),
      2: makeReviewPage(reviews(1, 3), { count: 3, offset: 2 }),
    },
    { 2: gate.promise },
  )
  const { user, router } = await openFromCard('Title 2')
  expect(nextButton()).toHaveAccessibleName('Next review')
  expect(nextButton()).not.toHaveAttribute('aria-disabled')

  await user.click(nextButton())

  await waitFor(() => expect(offsets).toEqual(['0', '2']))
  expect(nextButton()).toHaveAttribute('aria-busy', 'true')
  expect(router.state.location.pathname).toBe('/reviews/2')

  gate.resolve()

  await waitFor(() => expect(router.state.location.pathname).toBe('/reviews/3'))
  expect(router.state.historyAction).toBe('REPLACE')
  expect(
    await within(dialog()).findByRole('heading', { level: 2, name: 'Title 3' }),
  ).toBeInTheDocument()
  expect(nextButton()).not.toHaveAttribute('aria-busy')
  expect(nextButton()).toHaveAttribute('aria-disabled', 'true')
  expect(offsets).toEqual(['0', '2'])
})

it('doesn’t step when the page arrives after Close', async () => {
  stubExitAnimation()
  const gate = deferred()
  const { offsets } = serveShelf(
    {
      0: makeReviewPage(reviews(2), { count: 3 }),
      2: makeReviewPage(reviews(1, 3), { count: 3, offset: 2 }),
    },
    { 2: gate.promise },
  )
  const { user, router } = await openFromCard('Title 2')

  await user.click(nextButton())
  await waitFor(() => expect(offsets).toEqual(['0', '2']))
  await user.click(screen.getByRole('button', { name: 'Close' }))
  const closing = dialog()

  gate.resolve()
  await waitFor(() =>
    expect(screen.getAllByRole('article', { hidden: true })).toHaveLength(4),
  )
  await settle()
  expect(router.state.location.pathname).toBe('/reviews/2')

  finishExitAnimation(closing)

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.historyAction).toBe('POP')
})

it('has no axe violations', async () => {
  renderRoute('/reviews/1')
  await screen.findByRole('dialog', { name: 'Cowboy Bebop' })
  await within(dialog()).findByText('MyAnimeList', { selector: 'dt' })

  // Not document.body: axe's region rule misfires on portaled content.
  await expectNoAxeViolations(dialog())
}, 30_000)
