import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  parseWatchlistCategory,
  toListParams,
  useWatchlistCategory,
} from './useWatchlistCategory'

const parse = (search: string) =>
  parseWatchlistCategory(new URLSearchParams(search))

describe('parseWatchlistCategory', () => {
  it('is All without the param', () => {
    expect(parse('')).toBe('')
  })

  it.each(['movie', 'series', 'anime:series', 'anime:movie', 'book'])(
    'keeps %s',
    (id) => {
      expect(parse(`category=${id}`)).toBe(id)
    },
  )

  it.each([
    'category=bogus',
    // The parent category, which the chips don't offer.
    'category=anime',
    'category=movie,game',
    'category=',
  ])('reads %s as All', (search) => {
    expect(parse(search)).toBe('')
  })

  it('takes the first category', () => {
    expect(parse('category=game&category=movie')).toBe('game')
  })
})

describe('toListParams', () => {
  it('is exactly {} for All', () => {
    expect(toListParams('')).toStrictEqual({})
  })

  it('sends a category as a one-item list', () => {
    expect(toListParams('anime:movie')).toStrictEqual({
      category: ['anime:movie'],
    })
  })
})

describe('useWatchlistCategory', () => {
  function renderUseWatchlistCategory(path: string) {
    const result: {
      current: ReturnType<typeof useWatchlistCategory> | null
    } = { current: null }
    function Probe() {
      result.current = useWatchlistCategory()
      return null
    }
    const router = createMemoryRouter(
      [{ path: '/watchlist', element: <Probe /> }],
      { initialEntries: [path] },
    )
    render(<RouterProvider router={router} />)
    return { router, hook: () => result.current! }
  }

  it('reads the category from the URL', () => {
    const { hook } = renderUseWatchlistCategory(
      '/watchlist?category=anime:movie',
    )

    expect(hook().category).toBe('anime:movie')
  })

  it('pushes a category and keeps the other params', async () => {
    const { router, hook } = renderUseWatchlistCategory('/watchlist?page=2')

    await act(() => hook().setCategory('game'))

    expect(router.state.historyAction).toBe('PUSH')
    expect(
      Object.fromEntries(new URLSearchParams(router.state.location.search)),
    ).toEqual({ page: '2', category: 'game' })
    expect(hook().category).toBe('game')
  })

  it('removes the param for All', async () => {
    const { router, hook } = renderUseWatchlistCategory(
      '/watchlist?category=movie&page=2',
    )

    await act(() => hook().setCategory(''))

    expect(router.state.historyAction).toBe('PUSH')
    expect(router.state.location.search).toBe('?page=2')
    expect(hook().category).toBe('')
  })

  it('replaces the history entry when asked', async () => {
    const { router, hook } = renderUseWatchlistCategory(
      '/watchlist?category=movie',
    )

    await act(() => hook().setCategory('', { replace: true }))

    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.search).toBe('')
  })

  it('does not navigate to the category it already has', async () => {
    const { router, hook } = renderUseWatchlistCategory(
      '/watchlist?category=movie',
    )
    const location = router.state.location

    await act(() => hook().setCategory('movie'))

    expect(router.state.location).toBe(location)
    expect(router.state.historyAction).toBe('POP')
  })
})
