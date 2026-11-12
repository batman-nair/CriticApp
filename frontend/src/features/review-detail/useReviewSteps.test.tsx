import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore } from 'react'
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useParams,
} from 'react-router'
import { expect, it, vi } from 'vitest'
import type { ReviewListOutlet } from '../../lib/reviewListOutlet'
import { settle } from '../../test/dialogAnimation'
import { makeItem, makeReview } from '../../test/fixtures'
import { ReviewSteps } from './ReviewSteps'
import { useReviewSteps } from './useReviewSteps'

function reviews(count: number, firstId = 1) {
  return Array.from({ length: count }, (_, i) => {
    const id = firstId + i
    return makeReview({ id, item: makeItem({ title: `Title ${id}` }) })
  })
}

interface State {
  /** Undefined renders no context, as a dialog outside the list would get. */
  list: ReviewListOutlet | undefined
  open: boolean
}

/** What the list behind would hand down, changed with `set`. */
function createStore(initial: State) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next: Partial<State>) {
      state = { ...state, ...next }
      act(() => listeners.forEach((listener) => listener()))
    },
  }
}

type Store = ReturnType<typeof createStore>

function list(overrides: Partial<ReviewListOutlet> = {}): ReviewListOutlet {
  return {
    reviews: reviews(3),
    hasNextPage: false,
    loadMore: vi.fn(() => Promise.resolve()),
    isLoadingMore: false,
    ...overrides,
  }
}

function renderSteps(path: string, initial: Partial<State> = {}) {
  const store = createStore({ list: list(), open: true, ...initial })

  function ListStub() {
    const { list } = useSyncExternalStore(store.subscribe, store.get)
    return <Outlet context={list} />
  }

  function Detail() {
    const { open } = useSyncExternalStore(store.subscribe, store.get)
    const steps = useReviewSteps(Number(useParams().id), open)
    return <ReviewSteps {...steps} />
  }

  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <ListStub />,
        children: [{ path: 'reviews/:id', element: <Detail /> }],
      },
    ],
    {
      initialEntries: [
        '/?sort=title',
        { pathname: path, search: '?sort=title', state: { fromParent: true } },
      ],
      initialIndex: 1,
    },
  )
  render(<RouterProvider router={router} />)
  return { router, store, user: userEvent.setup() }
}

const previousButton = () =>
  screen.getByRole('button', { name: /^Previous review/ })
const nextButton = () => screen.getByRole('button', { name: /^Next review/ })

function loadMoreOf(store: Store) {
  return store.get().list!.loadMore as ReturnType<typeof vi.fn>
}

it('names the neighbours', () => {
  renderSteps('/reviews/2')

  expect(previousButton()).toHaveAccessibleName('Previous review: Title 1')
  expect(nextButton()).toHaveAccessibleName('Next review: Title 3')
  expect(previousButton()).not.toHaveAttribute('aria-disabled')
  expect(nextButton()).not.toHaveAttribute('aria-disabled')
})

it('steps by replacing the URL, keeping its query and state', async () => {
  const { router, user } = renderSteps('/reviews/2')

  await user.click(nextButton())

  expect(router.state.location.pathname).toBe('/reviews/3')
  expect(router.state.location.search).toBe('?sort=title')
  expect(router.state.location.state).toEqual({ fromParent: true })
  expect(router.state.historyAction).toBe('REPLACE')

  await user.click(previousButton())
  await user.click(previousButton())

  expect(router.state.location.pathname).toBe('/reviews/1')
  expect(router.state.location.state).toEqual({ fromParent: true })
  // Still one entry above the list.
  await act(() => router.navigate(-1))
  expect(router.state.location.pathname).toBe('/')
})

it('disables ‹ on the first review and › on the last', async () => {
  const { router, user } = renderSteps('/reviews/1')

  expect(previousButton()).toHaveAttribute('aria-disabled', 'true')
  expect(previousButton()).toHaveAccessibleName('Previous review')
  await user.click(previousButton())
  expect(router.state.location.pathname).toBe('/reviews/1')

  await user.click(nextButton())
  await user.click(nextButton())

  expect(router.state.location.pathname).toBe('/reviews/3')
  expect(nextButton()).toHaveAttribute('aria-disabled', 'true')
  expect(nextButton()).toHaveAccessibleName('Next review')
  // Kept, not dropped to the body.
  expect(nextButton()).toHaveFocus()
  await user.click(nextButton())
  expect(router.state.location.pathname).toBe('/reviews/3')
})

it('disables both without the list', () => {
  renderSteps('/reviews/2', { list: undefined })

  expect(previousButton()).toHaveAttribute('aria-disabled', 'true')
  expect(nextButton()).toHaveAttribute('aria-disabled', 'true')
})

it('disables both for a review the list hasn’t loaded', () => {
  renderSteps('/reviews/9', { list: list({ hasNextPage: true }) })

  expect(previousButton()).toHaveAttribute('aria-disabled', 'true')
  expect(nextButton()).toHaveAttribute('aria-disabled', 'true')
})

it('loads the next page from the last review, then steps to it', async () => {
  let finish!: () => void
  const loadMore = vi.fn(
    () => new Promise<void>((resolve) => (finish = resolve)),
  )
  const { router, store, user } = renderSteps('/reviews/3', {
    list: list({ hasNextPage: true, loadMore }),
  })
  expect(nextButton()).not.toHaveAttribute('aria-disabled')
  expect(nextButton()).toHaveAccessibleName('Next review')

  await user.click(nextButton())

  expect(loadMore).toHaveBeenCalledOnce()
  expect(nextButton()).toHaveAttribute('aria-busy', 'true')
  store.set({ list: { ...store.get().list!, isLoadingMore: true } })
  // Pressed again while it waits: nothing more.
  await user.click(nextButton())
  expect(loadMore).toHaveBeenCalledOnce()

  // The promise settles before the list renders the page.
  await act(async () => finish())
  expect(router.state.location.pathname).toBe('/reviews/3')
  store.set({
    list: list({ reviews: reviews(5), hasNextPage: false, loadMore }),
  })

  await waitFor(() => expect(router.state.location.pathname).toBe('/reviews/4'))
  expect(router.state.historyAction).toBe('REPLACE')
  expect(router.state.location.state).toEqual({ fromParent: true })
  expect(nextButton()).not.toHaveAttribute('aria-busy')
})

it('can try again when the list was busy or the page failed', async () => {
  const { store, user } = renderSteps('/reviews/3', {
    list: list({ hasNextPage: true }),
  })

  await user.click(nextButton())
  await settle()

  expect(nextButton()).not.toHaveAttribute('aria-busy')
  await user.click(nextButton())
  expect(loadMoreOf(store)).toHaveBeenCalledTimes(2)
})

it('does nothing while closing', async () => {
  const { router, store, user } = renderSteps('/reviews/2', { open: false })

  await user.click(nextButton())
  await user.click(previousButton())

  expect(router.state.location.pathname).toBe('/reviews/2')
  store.set({ open: true })
  await user.click(nextButton())
  expect(router.state.location.pathname).toBe('/reviews/3')
})

it('stays put when the page arrives after closing', async () => {
  let finish!: () => void
  const loadMore = vi.fn(
    () => new Promise<void>((resolve) => (finish = resolve)),
  )
  const { router, store, user } = renderSteps('/reviews/3', {
    list: list({ hasNextPage: true, isLoadingMore: false, loadMore }),
  })

  await user.click(nextButton())
  store.set({ list: { ...store.get().list!, isLoadingMore: true } })
  store.set({ open: false })
  await act(async () => finish())
  store.set({ list: list({ reviews: reviews(5), loadMore }) })
  await settle()

  expect(router.state.location.pathname).toBe('/reviews/3')
})
