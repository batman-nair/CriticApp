import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reviewKeys } from '../../api/queries/reviews'
import type { ReviewPage } from '../../api/types'
import { OWNER_USERNAME } from '../../config'
import { makeItem, makeReview, makeReviewPage } from '../../test/fixtures'
import { http } from '../../test/handlers'
import { stubIntersectionObserver } from '../../test/intersectionObserver'
import { stubSystemTheme } from '../../test/matchMedia'
import { renderRoute } from '../../test/renderRoute'
import { server } from '../../test/server'
import styles from './ReviewListPage.module.css'

// The header's theme toggle reads the system theme.
beforeEach(() => {
  stubSystemTheme('light')
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

function reviews(count: number, firstId = 1) {
  return Array.from({ length: count }, (_, i) => {
    const id = firstId + i
    return makeReview({ id, item: makeItem({ title: `Title ${id}` }) })
  })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

type Served = ReviewPage | 'error'

/**
 * Serves each offset's pages in turn, the last one again after that, and
 * records each request. A page waits for `gates[offset]` when there is one.
 */
function servePages(
  pages: Record<number, Served | Served[]>,
  gates: Record<number, Promise<void>> = {},
) {
  const requests: URLSearchParams[] = []
  const served: Record<number, number> = {}
  server.use(
    http.get('/api/v3/reviews', async ({ request, response }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      const offset = Number(params.get('offset'))
      const queue = [pages[offset] ?? []].flat()
      if (queue.length === 0) throw new Error(`No page at ${offset}`)
      const n = served[offset] ?? 0
      served[offset] = n + 1
      await gates[offset]
      const page = queue[Math.min(n, queue.length - 1)]!
      if (page === 'error') {
        return response.untyped(new HttpResponse(null, { status: 500 }))
      }
      return response(200).json(page)
    }),
  )
  return {
    offsets: () => requests.map((params) => params.get('offset')),
    requests,
  }
}

function cards() {
  return screen.queryAllByRole('article')
}

async function waitForCards(count: number) {
  await waitFor(() => expect(cards()).toHaveLength(count))
}

it('shows skeletons, in the list and the hero, until the first page', async () => {
  const gate = deferred()
  servePages({ 0: makeReviewPage(reviews(2)) }, { 0: gate.promise })
  const { container } = renderRoute('/')

  expect(screen.getByRole('status')).toHaveTextContent('Loading your reviews')
  expect(
    container.querySelector(`.${styles.subtitleSkeleton}`),
  ).toBeInTheDocument()

  gate.resolve()
  await waitForCards(2)
  expect(screen.queryByText('Loading your reviews')).not.toBeInTheDocument()
  expect(container.querySelector(`.${styles.subtitleSkeleton}`)).toBeNull()
})

it('shows the first page of the owner’s reviews with the count', async () => {
  const { requests } = servePages({
    0: makeReviewPage(reviews(20), { count: 45 }),
  })
  renderRoute('/')

  expect(
    await screen.findByText('45 reviews, rated out of ten'),
  ).toBeInTheDocument()
  expect(cards()).toHaveLength(20)
  expect(screen.getAllByRole('listitem')).toHaveLength(20)
  expect(requests[0]?.get('username')).toBe(OWNER_USERNAME)
})

it('counts a single review in the singular', async () => {
  servePages({ 0: makeReviewPage(reviews(1)) })
  renderRoute('/')

  expect(
    await screen.findByText('1 review, rated out of ten'),
  ).toBeInTheDocument()
})

it('loads the next page when the end of the list comes near', async () => {
  const io = stubIntersectionObserver()
  const gate = deferred()
  const { offsets } = servePages(
    {
      0: makeReviewPage(reviews(20), { count: 45 }),
      20: makeReviewPage(reviews(20, 21), { count: 45, offset: 20 }),
    },
    { 20: gate.promise },
  )
  renderRoute('/')
  await waitForCards(20)
  const status = screen.getByRole('status')
  expect(status).toBeEmptyDOMElement()

  io.setIntersecting(true)

  // The same region, so screen readers announce the change.
  await waitFor(() => expect(status).toHaveTextContent('Loading more…'))
  expect(offsets()).toEqual(['0', '20'])

  // Out of view before the page lands, or its sentinel would ask for 40.
  io.setIntersecting(false)
  gate.resolve()
  await waitForCards(40)
  expect(status).toBeEmptyDOMElement()
  expect(offsets()).toEqual(['0', '20'])
})

it('stops at the last page', async () => {
  const io = stubIntersectionObserver()
  const { offsets } = servePages({
    0: makeReviewPage(reviews(20), { count: 25 }),
    20: makeReviewPage(reviews(5, 21), { count: 25, offset: 20 }),
  })
  const { container } = renderRoute('/')
  await waitForCards(20)

  io.setIntersecting(true)

  await waitForCards(25)
  expect(container.querySelector(`.${styles.sentinel}`)).toBeNull()
  expect(io.observers.every((observer) => observer.disconnected)).toBe(true)
  expect(offsets()).toEqual(['0', '20'])
})

it('shows the empty shelf when there are no reviews', async () => {
  servePages({ 0: makeReviewPage([]) })
  const { container } = renderRoute('/')

  expect(
    await screen.findByRole('heading', { name: 'Your shelf is empty' }),
  ).toBeInTheDocument()
  expect(screen.getByText('No reviews yet')).toBeInTheDocument()
  expect(container.querySelector(`.${styles.sentinel}`)).toBeNull()
})

it('shows the error, and skeletons then cards after "Try again"', async () => {
  const user = userEvent.setup()
  const gate = deferred()
  servePages({ 0: 'error' })
  renderRoute('/')

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Couldn’t load your reviews')
  expect(screen.queryByText(/rated out of ten/)).not.toBeInTheDocument()

  // Hold the retry, to see what shows while it runs.
  servePages({ 0: makeReviewPage(reviews(2)) }, { 0: gate.promise })
  await user.click(within(alert).getByRole('button', { name: 'Try again' }))

  expect(await screen.findByText('Loading your reviews')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  gate.resolve()
  await waitForCards(2)
})

it('keeps the cards when the next page fails, and retries it inline', async () => {
  const user = userEvent.setup()
  const io = stubIntersectionObserver()
  const { offsets } = servePages({
    0: makeReviewPage(reviews(20), { count: 40 }),
    20: ['error', makeReviewPage(reviews(20, 21), { count: 40, offset: 20 })],
  })
  renderRoute('/')
  await waitForCards(20)

  io.setIntersecting(true)

  expect(
    await screen.findByText('Couldn’t load more reviews.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(cards()).toHaveLength(20)
  // The sentinel waits for the retry rather than asking again by itself.
  expect(offsets()).toEqual(['0', '20'])

  await user.click(screen.getByRole('button', { name: 'Try again' }))

  await waitForCards(40)
  expect(
    screen.queryByText('Couldn’t load more reviews.'),
  ).not.toBeInTheDocument()
  expect(offsets()).toEqual(['0', '20', '20'])
})

it('keeps the cards when a background refetch fails', async () => {
  const { queryClient } = renderRoute('/')
  await waitForCards(2)

  servePages({ 0: 'error' })
  await act(() => queryClient.refetchQueries())

  const key = reviewKeys.list({ username: OWNER_USERNAME })
  expect(queryClient.getQueryState(key)?.status).toBe('error')
  expect(cards()).toHaveLength(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows a review that moved to the next page once', async () => {
  const io = stubIntersectionObserver()
  servePages({
    0: makeReviewPage(reviews(20), { count: 40 }),
    // Starts with the first page's last review again.
    20: makeReviewPage(reviews(20, 20), { count: 40, offset: 20 }),
  })
  renderRoute('/')
  await waitForCards(20)

  io.setIntersecting(true)

  await waitForCards(39)
  expect(screen.getAllByRole('heading', { name: 'Title 20' })).toHaveLength(1)
})
