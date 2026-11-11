import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { OWNER_USERNAME } from '../../config'
import {
  parseReviewFilters,
  toFacetParams,
  toListParams,
  useReviewFilters,
  writeReviewFilters,
  type ReviewFilters,
} from './useReviewFilters'

const defaults: ReviewFilters = {
  q: '',
  category: '',
  language: '',
  sort: '-updated',
}

const parse = (search: string) =>
  parseReviewFilters(new URLSearchParams(search))

describe('parseReviewFilters', () => {
  it('gives the defaults for no params', () => {
    expect(parse('')).toEqual(defaults)
  })

  it('keeps valid values', () => {
    expect(
      parse('q=dune&category=anime:movie&language=English&sort=-rating'),
    ).toEqual({
      q: 'dune',
      category: 'anime:movie',
      language: 'English',
      sort: '-rating',
    })
  })

  it.each([
    ['category=bogus', 'category'],
    // The parent category, which the chips don't offer.
    ['category=anime', 'category'],
    ['category=movie,game', 'category'],
    // The API takes it, but the menu doesn't offer it.
    ['sort=-title', 'sort'],
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

describe('writeReviewFilters', () => {
  it('leaves out the defaults', () => {
    const params = new URLSearchParams('q=dune&category=movie&sort=title')

    expect(writeReviewFilters(params, defaults).toString()).toBe('')
  })

  it('writes the values that differ from the defaults', () => {
    const params = writeReviewFilters(new URLSearchParams(), {
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

  it('keeps other params and leaves the original alone', () => {
    const params = new URLSearchParams('page=2&q=old')
    const next = writeReviewFilters(params, { ...defaults, q: 'new' })

    expect(Object.fromEntries(next)).toEqual({ page: '2', q: 'new' })
    expect(params.toString()).toBe('page=2&q=old')
  })
})

describe('toListParams', () => {
  it('is exactly the owner with the defaults', () => {
    expect(toListParams(defaults)).toStrictEqual({ username: OWNER_USERNAME })
  })

  it('adds the filters that are set', () => {
    expect(
      toListParams({
        q: 'dune',
        category: 'movie',
        language: 'English',
        sort: '-rating',
      }),
    ).toStrictEqual({
      username: OWNER_USERNAME,
      q: 'dune',
      category: ['movie'],
      language: ['English'],
      sort: '-rating',
    })
  })
})

describe('toFacetParams', () => {
  it('leaves out the sort', () => {
    expect(
      toFacetParams({
        q: 'dune',
        category: 'movie',
        language: 'English',
        sort: '-rating',
      }),
    ).toStrictEqual({
      username: OWNER_USERNAME,
      q: 'dune',
      category: ['movie'],
      language: ['English'],
    })
  })

  it('is exactly the owner with the defaults', () => {
    expect(toFacetParams(defaults)).toStrictEqual({ username: OWNER_USERNAME })
  })
})

describe('useReviewFilters', () => {
  function renderUseReviewFilters(path: string) {
    const result: { current: ReturnType<typeof useReviewFilters> | null } = {
      current: null,
    }
    function Probe() {
      result.current = useReviewFilters()
      return null
    }
    const router = createMemoryRouter([{ path: '/', element: <Probe /> }], {
      initialEntries: [path],
    })
    render(<RouterProvider router={router} />)
    return { router, hook: () => result.current! }
  }

  it('reads the filters from the URL', () => {
    const { hook } = renderUseReviewFilters('/?q=dune&sort=title')

    expect(hook().filters).toEqual({ ...defaults, q: 'dune', sort: 'title' })
    expect(hook().isFiltered).toBe(true)
  })

  it('is not filtered by a sort alone', () => {
    const { hook } = renderUseReviewFilters('/?sort=title')

    expect(hook().isFiltered).toBe(false)
  })

  it('pushes a filter change and keeps the other params', async () => {
    const { router, hook } = renderUseReviewFilters('/?q=dune&page=2')

    await act(() => hook().setFilters({ category: 'movie' }))

    expect(router.state.historyAction).toBe('PUSH')
    expect(
      Object.fromEntries(new URLSearchParams(router.state.location.search)),
    ).toEqual({ q: 'dune', category: 'movie', page: '2' })
    expect(hook().filters.category).toBe('movie')
  })

  it('replaces the entry when asked', async () => {
    const { router, hook } = renderUseReviewFilters('/')

    await act(() => hook().setFilters({ q: 'dune' }, { replace: true }))

    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.search).toBe('?q=dune')
  })

  it('does not navigate to the filters it already has', async () => {
    const { router, hook } = renderUseReviewFilters('/?category=movie')
    const location = router.state.location

    await act(() => hook().setFilters({ category: 'movie' }))

    expect(router.state.location).toBe(location)
    expect(router.state.historyAction).toBe('POP')
  })

  it('clears the filters but keeps the sort', async () => {
    const { router, hook } = renderUseReviewFilters(
      '/?q=dune&category=movie&language=English&sort=title',
    )

    await act(() => hook().clearFilters())

    expect(router.state.historyAction).toBe('PUSH')
    expect(router.state.location.search).toBe('?sort=title')
    expect(hook().isFiltered).toBe(false)
  })
})
