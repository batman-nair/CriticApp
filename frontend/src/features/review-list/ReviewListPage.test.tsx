import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import {
  createMemoryRouter,
  RouterProvider,
  useOutletContext,
} from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reviewKeys } from '../../api/queries/reviews'
import type { ReviewFacets, ReviewPage } from '../../api/types'
import { OWNER_USERNAME } from '../../config'
import type { ReviewListOutlet } from '../../lib/reviewListOutlet'
import {
  makeItem,
  makeReview,
  makeReviewFacets,
  makeReviewPage,
} from '../../test/fixtures'
import { http } from '../../test/handlers'
import { stubIntersectionObserver } from '../../test/intersectionObserver'
import { stubSystemTheme } from '../../test/matchMedia'
import { createTestQueryClient } from '../../test/render'
import { renderRoute } from '../../test/renderRoute'
import { server } from '../../test/server'
import { ReviewListPage } from './ReviewListPage'
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

type ServedFacets = Partial<ReviewFacets> | 'error'

/**
 * Serves the counts `respond` gives for each request's params, after `gate`
 * when there is one, and records each request.
 */
function serveFacets(
  respond: ServedFacets | ((params: URLSearchParams) => ServedFacets),
  gate?: Promise<void>,
) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get('/api/v3/reviews/facets', async ({ request, response }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      await gate
      const served = typeof respond === 'function' ? respond(params) : respond
      if (served === 'error') {
        return response.untyped(new HttpResponse(null, { status: 500 }))
      }
      return response(200).json(makeReviewFacets(served))
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

const searchBox = () =>
  screen.getByRole('searchbox', { name: 'Search reviews' })

/** A chip by its label, with or without a count. */
const chip = (label: string) =>
  within(screen.getByRole('group', { name: 'Categories' })).getByRole(
    'button',
    { name: new RegExp(`^${label}( \\d+)?$`) },
  )

it('shows skeletons, in the list and the hero, until the first page', async () => {
  const gate = deferred()
  servePages({ 0: makeReviewPage(reviews(2)) }, { 0: gate.promise })
  // The hero's count comes from the counts.
  serveFacets({}, gate.promise)
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
  serveFacets({ total: 45 })
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
  serveFacets({ total: 1 })
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
  serveFacets({ total: 0 })
  const { container } = renderRoute('/')

  expect(
    await screen.findByRole('heading', { name: 'Your shelf is empty' }),
  ).toBeInTheDocument()
  expect(screen.getByText('No reviews yet')).toBeInTheDocument()
  expect(container.querySelector(`.${styles.sentinel}`)).toBeNull()
})

it('hides the filters and the count row on the empty shelf', async () => {
  servePages({ 0: makeReviewPage([]) })
  serveFacets({ total: 0 })
  const { container } = renderRoute('/')

  await screen.findByRole('heading', { name: 'Your shelf is empty' })
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Categories' })).toBeNull()
  expect(container.querySelector(`.${styles.countRow}`)).toBeNull()
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

  // Hold the retry, to see the page while it loads.
  const retry = deferred()
  const retried: (string | null)[] = []
  server.use(
    http.get('/api/v3/reviews', async ({ request, response }) => {
      retried.push(new URL(request.url).searchParams.get('offset'))
      await retry.promise
      return response(200).json(
        makeReviewPage(reviews(20, 21), { count: 40, offset: 20 }),
      )
    }),
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Loading more…'),
  )
  expect(
    screen.queryByText('Couldn’t load more reviews.'),
  ).not.toBeInTheDocument()

  retry.resolve()
  await waitForCards(40)
  expect(
    screen.queryByText('Couldn’t load more reviews.'),
  ).not.toBeInTheDocument()
  expect(retried).toEqual(['20'])
})

it('waits for a background refetch before loading the next page', async () => {
  const io = stubIntersectionObserver()
  servePages({ 0: makeReviewPage(reviews(20), { count: 40 }) })
  const { queryClient } = renderRoute('/')
  await waitForCards(20)

  // Hold the refetch of the first page; serve the second at once.
  const refetch = deferred()
  const requested: (string | null)[] = []
  server.use(
    http.get('/api/v3/reviews', async ({ request, response }) => {
      const offset = new URL(request.url).searchParams.get('offset')
      requested.push(offset)
      if (offset === '0') {
        await refetch.promise
        return response(200).json(makeReviewPage(reviews(20), { count: 40 }))
      }
      return response(200).json(
        makeReviewPage(reviews(20, 21), { count: 40, offset: 20 }),
      )
    }),
  )
  act(() => void queryClient.refetchQueries())
  await waitFor(() => expect(requested).toEqual(['0']))
  io.setIntersecting(true)

  // Give a next-page request the time to reach the handler.
  await act(() => new Promise((done) => setTimeout(done, 50)))
  expect(requested).toEqual(['0'])

  refetch.resolve()
  await waitForCards(40)
  expect(requested).toEqual(['0', '20'])
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

it('sends the URL’s filters to the list, and all but the sort to the counts', async () => {
  const list = servePages({ 0: makeReviewPage(reviews(1)) })
  const facets = serveFacets({})
  renderRoute('/?q=dune&category=movie&language=English&sort=-rating')
  await waitForCards(1)

  const [request] = list.requests
  expect(request?.get('q')).toBe('dune')
  expect(request?.get('category')).toBe('movie')
  expect(request?.get('language')).toBe('English')
  expect(request?.get('sort')).toBe('-rating')

  // The panel's counts and the hero's.
  await waitFor(() => expect(facets.requests).toHaveLength(2))
  const filtered = facets.requests.find((params) => params.has('q'))
  expect(filtered?.get('q')).toBe('dune')
  expect(filtered?.get('category')).toBe('movie')
  expect(filtered?.get('language')).toBe('English')
  expect(facets.requests.some((params) => params.has('sort'))).toBe(false)
})

it('leaves out a category or sort the API would reject', async () => {
  const list = servePages({ 0: makeReviewPage(reviews(1)) })
  const facets = serveFacets({})
  renderRoute('/?category=bogus&sort=nope')
  await waitForCards(1)
  await waitFor(() => expect(facets.requests).toHaveLength(1))

  for (const params of [...list.requests, ...facets.requests]) {
    expect(params.has('category')).toBe(false)
    expect(params.has('sort')).toBe(false)
  }
})

it('counts every review in the hero, and the matches in the count row', async () => {
  servePages({ 0: makeReviewPage(reviews(3)) })
  // The filtered counts differ, to show which ones the hero uses.
  serveFacets((params) => (params.has('q') ? { total: 7 } : { total: 45 }))
  renderRoute('/?q=dune&category=game')

  expect(
    await screen.findByText('45 reviews, rated out of ten'),
  ).toBeInTheDocument()
  expect(screen.getByText('3 reviews')).toHaveAttribute('aria-live', 'polite')
  await waitFor(() => expect(chip('All')).toHaveAccessibleName('All 7'))
})

it('counts a single match in the singular', async () => {
  servePages({ 0: makeReviewPage(reviews(1)) })
  renderRoute('/?category=movie')

  expect(await screen.findByText('1 review')).toBeInTheDocument()
})

it('shows "no matches" with the filters, then the list after "Clear filters"', async () => {
  const user = userEvent.setup()
  const list = servePages({
    0: [makeReviewPage([]), makeReviewPage(reviews(3))],
  })
  const { router } = renderRoute('/?q=zzz&sort=title')

  expect(
    await screen.findByRole('heading', {
      name: 'Haven’t reviewed anything like that',
    }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Your shelf is empty' }),
  ).not.toBeInTheDocument()
  expect(searchBox()).toHaveValue('zzz')
  expect(screen.getByText('0 reviews')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Clear filters' }))

  await waitForCards(3)
  // The sort stays.
  expect(router.state.location.search).toBe('?sort=title')
  expect(list.requests[1]?.has('q')).toBe(false)
  expect(searchBox()).toHaveValue('')
  expect(
    screen.queryByRole('button', { name: 'Clear filters' }),
  ).not.toBeInTheDocument()
})

it('keeps the cards on screen while the next filter loads', async () => {
  const user = userEvent.setup()
  servePages({ 0: makeReviewPage(reviews(2)) })
  const { container } = renderRoute('/')
  await waitForCards(2)
  const results = container.querySelector(`.${styles.results}`)
  expect(results).not.toHaveAttribute('aria-busy')

  const gate = deferred()
  const list = servePages(
    { 0: makeReviewPage(reviews(1, 10)) },
    { 0: gate.promise },
  )
  await user.click(chip('Movies'))

  await waitFor(() => expect(list.requests).toHaveLength(1))
  expect(list.requests[0]?.get('category')).toBe('movie')
  expect(results).toHaveAttribute('aria-busy', 'true')
  expect(cards()).toHaveLength(2)
  expect(screen.queryByText('Loading your reviews')).not.toBeInTheDocument()

  gate.resolve()
  expect(
    await screen.findByRole('heading', { name: 'Title 10' }),
  ).toBeInTheDocument()
  expect(cards()).toHaveLength(1)
  expect(results).not.toHaveAttribute('aria-busy')
})

it('shows a disabled search until the first page, then the live panel', async () => {
  const gate = deferred()
  servePages({ 0: makeReviewPage(reviews(2)) }, { 0: gate.promise })
  const { container } = renderRoute('/')

  expect(searchBox()).toBeDisabled()
  expect(searchBox()).toHaveAttribute('placeholder', 'Loading your reviews…')
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(container.querySelector(`.${styles.countRow}`)).toBeNull()

  gate.resolve()
  await waitForCards(2)
  expect(searchBox()).toBeEnabled()
  expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
  expect(screen.getByText('2 reviews')).toBeInTheDocument()
})

it('shows the search as unavailable when the first page fails', async () => {
  servePages({ 0: 'error' })
  const { container } = renderRoute('/?category=movie')

  await screen.findByRole('alert')
  expect(searchBox()).toBeDisabled()
  expect(searchBox()).toHaveAttribute(
    'placeholder',
    'Search is unavailable right now',
  )
  expect(container.querySelector(`.${styles.countRow}`)).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Clear filters' }),
  ).not.toBeInTheDocument()
})

it('keeps the live panel and the hero count when a filter fails later', async () => {
  const user = userEvent.setup()
  serveFacets({ total: 45 })
  const { router } = renderRoute('/')
  await waitForCards(2)
  expect(screen.getByText('45 reviews, rated out of ten')).toBeInTheDocument()

  servePages({ 0: 'error' })
  await user.click(chip('Games'))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Couldn’t load your reviews',
  )
  expect(cards()).toHaveLength(0)
  expect(screen.getByText('45 reviews, rated out of ten')).toBeInTheDocument()
  // Still there to change or clear the filter.
  expect(searchBox()).toBeEnabled()
  await user.type(searchBox(), 'du')
  expect(searchBox()).toHaveValue('du')
  expect(chip('Games')).toHaveAttribute('aria-pressed', 'true')

  servePages({ 0: makeReviewPage(reviews(2)) })
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))

  await waitForCards(2)
  expect(router.state.location.search).toBe('')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('keeps the live panel when only the counts fail', async () => {
  const user = userEvent.setup()
  servePages({ 0: makeReviewPage(reviews(20), { count: 45 }) })
  const facets = serveFacets('error')
  const { router } = renderRoute('/')
  await waitForCards(20)
  await waitFor(() => expect(facets.requests).toHaveLength(1))

  // The list's count stands in for the hero's.
  expect(
    await screen.findByText('45 reviews, rated out of ten'),
  ).toBeInTheDocument()
  expect(searchBox()).toBeEnabled()
  expect(chip('All')).toHaveAccessibleName('All')
  expect(chip('Movies')).toHaveAccessibleName('Movies')

  await user.click(chip('Movies'))
  await waitFor(() =>
    expect(router.state.location.search).toBe('?category=movie'),
  )
})

it('refetches the failed counts too on "Try again"', async () => {
  const user = userEvent.setup()
  servePages({ 0: ['error', makeReviewPage(reviews(2))] })
  const facets = serveFacets('error')
  renderRoute('/')
  const alert = await screen.findByRole('alert')
  await waitFor(() => expect(facets.requests).toHaveLength(1))

  serveFacets({ total: 2 })
  await user.click(within(alert).getByRole('button', { name: 'Try again' }))

  await waitForCards(2)
  await waitFor(() => expect(chip('All')).toHaveAccessibleName('All 2'))
  expect(screen.getByText('2 reviews, rated out of ten')).toBeInTheDocument()
})

it('keeps the panel and the focused search while a cleared search loads', async () => {
  const user = userEvent.setup()
  servePages({ 0: makeReviewPage([]) })
  const { router } = renderRoute('/?q=zzz')
  await screen.findByRole('heading', {
    name: 'Haven’t reviewed anything like that',
  })

  // Hold the unfiltered page, so the empty search result stands in for it.
  const gate = deferred()
  servePages({ 0: makeReviewPage(reviews(2)) }, { 0: gate.promise })
  await user.clear(searchBox())

  await waitFor(() => expect(router.state.location.search).toBe(''))
  await act(() => new Promise((done) => setTimeout(done, 50)))
  expect(
    screen.queryByRole('heading', { name: 'Your shelf is empty' }),
  ).not.toBeInTheDocument()
  expect(searchBox()).toHaveFocus()

  gate.resolve()
  await waitForCards(2)
  expect(searchBox()).toHaveFocus()
  expect(
    screen.queryByRole('heading', { name: 'Your shelf is empty' }),
  ).not.toBeInTheDocument()
})

it('drops a search still being typed on "Clear filters", and focuses the search', async () => {
  const user = userEvent.setup()
  const { router } = renderRoute('/?category=movie')
  await waitForCards(2)

  // Within the debounce, so the search hasn't reached the URL yet.
  await user.type(searchBox(), 'du')
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))

  await waitFor(() => expect(router.state.location.search).toBe(''))
  await act(() => new Promise((done) => setTimeout(done, 400)))
  expect(router.state.location.search).toBe('')
  expect(searchBox()).toHaveValue('')
  expect(searchBox()).toHaveFocus()
})

it('refetches a failed hero count on "Try again" while a filter is set', async () => {
  const user = userEvent.setup()
  servePages({ 0: ['error', makeReviewPage(reviews(2))] })
  const facets = serveFacets('error')
  renderRoute('/?category=game')
  const alert = await screen.findByRole('alert')
  await waitFor(() => expect(facets.requests).toHaveLength(2))

  serveFacets({ total: 45 })
  await user.click(within(alert).getByRole('button', { name: 'Try again' }))

  await waitForCards(2)
  expect(
    await screen.findByText('45 reviews, rated out of ten'),
  ).toBeInTheDocument()
})

/** A child route showing what the list hands down, as the detail reads it. */
function OutletProbe() {
  const { reviews, hasNextPage, loadMore, isLoadingMore } =
    useOutletContext<ReviewListOutlet>()

  return (
    <div>
      <p data-testid="ids">{reviews.map((review) => review.id).join(',')}</p>
      <p data-testid="flags">
        {`more: ${hasNextPage}, loading: ${isLoadingMore}`}
      </p>
      <button type="button" onClick={() => void loadMore()}>
        Load more
      </button>
    </div>
  )
}

it('hands its reviews and loadMore to the route inside it', async () => {
  const user = userEvent.setup()
  const gate = deferred()
  const { offsets } = servePages(
    {
      0: makeReviewPage(reviews(2), { count: 4 }),
      // Starts with the first page's last review again.
      2: makeReviewPage(reviews(2, 2), { count: 4, offset: 2 }),
    },
    { 2: gate.promise },
  )
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <ReviewListPage />,
        children: [{ path: 'probe', element: <OutletProbe /> }],
      },
    ],
    { initialEntries: ['/probe'] },
  )
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  const ids = screen.getByTestId('ids')
  const flags = screen.getByTestId('flags')
  await waitFor(() => expect(ids).toHaveTextContent('1,2'))
  expect(flags).toHaveTextContent('more: true, loading: false')

  await user.click(screen.getByRole('button', { name: 'Load more' }))

  await waitFor(() =>
    expect(flags).toHaveTextContent('more: true, loading: true'),
  )
  // Nothing more while that page is on its way.
  await user.click(screen.getByRole('button', { name: 'Load more' }))
  expect(offsets()).toEqual(['0', '2'])

  gate.resolve()
  await waitFor(() => expect(ids).toHaveTextContent('1,2,3'))
  expect(ids.textContent).toBe('1,2,3')
  expect(flags).toHaveTextContent('more: false, loading: false')
  expect(offsets()).toEqual(['0', '2'])
})
