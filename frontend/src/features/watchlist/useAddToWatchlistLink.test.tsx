import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { FILTER_CATEGORIES } from '../../lib/categories'
import { fromParentState } from '../../ui/Dialog/useRouteDialog'
import {
  searchCategoryFor,
  useAddToWatchlistLink,
} from './useAddToWatchlistLink'

function renderLink(
  path: string,
  ...args: Parameters<typeof useAddToWatchlistLink>
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  }
  return renderHook(() => useAddToWatchlistLink(...args), { wrapper: Wrapper })
}

describe('useAddToWatchlistLink', () => {
  it('opens the sheet from the page, keeping its query', () => {
    const { result } = renderLink('/watchlist?category=game')

    expect(result.current).toEqual({
      to: { pathname: '/watchlist/add', search: '?category=game' },
      state: fromParentState,
    })
  })

  it('starts the sheet on a category', () => {
    const { result } = renderLink('/watchlist', 'anime')

    expect(result.current).toEqual({
      to: { pathname: '/watchlist/add', search: '' },
      state: { fromParent: true, category: 'anime' },
    })
  })
})

describe('searchCategoryFor', () => {
  it('searches anime for both anime chips, and each other chip as it is', () => {
    expect(FILTER_CATEGORIES.map(searchCategoryFor)).toEqual([
      'movie',
      'series',
      'game',
      'anime',
      'anime',
      'manga',
      'book',
    ])
  })
})
