import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  parseWatchlistFilters,
  toFacetParams,
  toListParams,
  useWatchlistFilters,
  writeWatchlistFilters,
  type WatchlistFilters,
} from './useWatchlistFilters'

const defaults: WatchlistFilters = {
  q: '',
  category: '',
  language: '',
  sort: '-added',
}

const parse = (search: string) =>
  parseWatchlistFilters(new URLSearchParams(search))

describe('parseWatchlistFilters', () => {
  it('gives the defaults for no params', () => {
    expect(parse('')).toEqual(defaults)
  })

  it('keeps valid values', () => {
    expect(
      parse('q=dune&category=anime:movie&language=English&sort=-year'),
    ).toEqual({
      q: 'dune',
      category: 'anime:movie',
      language: 'English',
      sort: '-year',
    })
  })

  it.each(['movie', 'series', 'anime:series', 'anime:movie', 'book'])(
    'keeps the category %s',
    (id) => {
      expect(parse(`category=${id}`).category).toBe(id)
    },
  )

  it.each(['-added', 'title', '-rating', 'rating', '-year'])(
    'keeps the sort %s',
    (sort) => {
      expect(parse(`sort=${sort}`).sort).toBe(sort)
    },
  )

  it.each([
    ['category=bogus', 'category'],
    // The parent category, which the chips don't offer.
    ['category=anime', 'category'],
    ['category=movie,game', 'category'],
    ['category=', 'category'],
    // A review sort the watchlist doesn't have.
    ['sort=-updated', 'sort'],
    ['sort=x', 'sort'],
  ] as const)('falls back to the default for %s', (search, key) => {
    expect(parse(search)[key]).toBe(defaults[key])
  })

  it('takes the first category', () => {
    expect(parse('category=game&category=movie').category).toBe('game')
  })

  it('trims the search and the language', () => {
    expect(parse('q=%20dune%20&language=%20English%20')).toMatchObject({
      q: 'dune',
      language: 'English',
    })
  })
})

describe('writeWatchlistFilters', () => {
  it('leaves out the defaults', () => {
    const params = new URLSearchParams('q=dune&category=movie&sort=title')

    expect(writeWatchlistFilters(params, defaults).toString()).toBe('')
  })

  it('writes the values that differ from the defaults', () => {
    const params = writeWatchlistFilters(new URLSearchParams(), {
      q: 'dune',
      category: 'movie',
      language: 'English',
      sort: 'rating',
    })

    expect(Object.fromEntries(params)).toEqual({
      q: 'dune',
      category: 'movie',
      language: 'English',
      sort: 'rating',
    })
  })

  it('round-trips through parse', () => {
    const filters: WatchlistFilters = {
      q: 'dune',
      category: 'anime:series',
      language: 'Japanese',
      sort: '-year',
    }

    expect(
      parseWatchlistFilters(
        writeWatchlistFilters(new URLSearchParams(), filters),
      ),
    ).toEqual(filters)
  })

  it('keeps other params and leaves the original alone', () => {
    const params = new URLSearchParams('page=2&q=old')
    const next = writeWatchlistFilters(params, { ...defaults, q: 'new' })

    expect(Object.fromEntries(next)).toEqual({ page: '2', q: 'new' })
    expect(params.toString()).toBe('page=2&q=old')
  })
})

describe('toFacetParams', () => {
  it('is exactly {} with the defaults', () => {
    expect(toFacetParams(defaults)).toStrictEqual({})
  })

  it('sends the filters that are set and leaves out the sort', () => {
    expect(
      toFacetParams({
        q: 'dune',
        category: 'anime:movie',
        language: 'English',
        sort: '-rating',
      }),
    ).toStrictEqual({
      q: 'dune',
      category: ['anime:movie'],
      language: ['English'],
    })
  })
})

describe('toListParams', () => {
  it('is exactly {} with the defaults', () => {
    expect(toListParams(defaults)).toStrictEqual({})
  })

  it('adds the filters that are set and a sort other than the default', () => {
    expect(
      toListParams({
        q: 'dune',
        category: 'movie',
        language: 'English',
        sort: '-year',
      }),
    ).toStrictEqual({
      q: 'dune',
      category: ['movie'],
      language: ['English'],
      sort: '-year',
    })
  })
})

describe('useWatchlistFilters', () => {
  function renderUseWatchlistFilters(path: string) {
    const result: {
      current: ReturnType<typeof useWatchlistFilters> | null
    } = { current: null }
    function Probe() {
      result.current = useWatchlistFilters()
      return null
    }
    const router = createMemoryRouter(
      [{ path: '/watchlist', element: <Probe /> }],
      { initialEntries: [path] },
    )
    render(<RouterProvider router={router} />)
    return { router, hook: () => result.current! }
  }

  it('reads the filters from the URL', () => {
    const { hook } = renderUseWatchlistFilters(
      '/watchlist?q=dune&category=anime:movie&sort=title',
    )

    expect(hook().filters).toEqual({
      ...defaults,
      q: 'dune',
      category: 'anime:movie',
      sort: 'title',
    })
    expect(hook().isFiltered).toBe(true)
  })

  it('is not filtered by a sort alone', () => {
    const { hook } = renderUseWatchlistFilters('/watchlist?sort=title')

    expect(hook().isFiltered).toBe(false)
  })

  it('pushes a filter change and keeps the other params', async () => {
    const { router, hook } = renderUseWatchlistFilters('/watchlist?page=2')

    await act(() => hook().setFilters({ category: 'game' }))

    expect(router.state.historyAction).toBe('PUSH')
    expect(
      Object.fromEntries(new URLSearchParams(router.state.location.search)),
    ).toEqual({ page: '2', category: 'game' })
    expect(hook().filters.category).toBe('game')
  })

  it('replaces the history entry when asked', async () => {
    const { router, hook } = renderUseWatchlistFilters('/watchlist')

    await act(() => hook().setFilters({ q: 'dune' }, { replace: true }))

    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.search).toBe('?q=dune')
  })

  it('does not navigate to the filters it already has', async () => {
    const { router, hook } = renderUseWatchlistFilters(
      '/watchlist?category=movie',
    )
    const location = router.state.location

    await act(() => hook().setFilters({ category: 'movie' }))

    expect(router.state.location).toBe(location)
    expect(router.state.historyAction).toBe('POP')
  })

  it('clears the filters but keeps the sort', async () => {
    const { router, hook } = renderUseWatchlistFilters(
      '/watchlist?q=dune&category=movie&language=English&sort=title',
    )

    await act(() => hook().clearFilters())

    expect(router.state.historyAction).toBe('PUSH')
    expect(router.state.location.search).toBe('?sort=title')
    expect(hook().isFiltered).toBe(false)
  })

  it('clears over the history entry when asked', async () => {
    const { router, hook } = renderUseWatchlistFilters(
      '/watchlist?q=dune&category=movie',
    )

    await act(() => hook().clearFilters({ replace: true }))

    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.search).toBe('')
  })
})
