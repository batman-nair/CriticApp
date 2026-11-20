import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SearchResult } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeSearchResult } from '../../test/fixtures'
import { SearchResultRow, type WatchlistRowStatus } from './SearchResultRow'

function renderRow(
  overrides: Partial<SearchResult> = {},
  onSelect = vi.fn(),
  ratingLabel: string | null = 'IMDb',
) {
  const result = makeSearchResult(overrides)
  const view = render(
    <ul>
      <SearchResultRow
        result={result}
        ratingLabel={ratingLabel}
        onSelect={onSelect}
      />
    </ul>,
  )
  return { ...view, result, onSelect }
}

it('shows the title, year, genres and provider rating in a button', () => {
  renderRow({ provider_rating: 6.5 })

  const button = screen.getByRole('button')
  expect(button).toHaveTextContent('The Witcher 3: Wild Hunt 2015')
  expect(screen.getByText('2015')).toBeInTheDocument()
  expect(screen.getByText('Role-playing (RPG), Adventure')).toBeInTheDocument()
  expect(button).toHaveTextContent('IMDb 6.5')
  expect(screen.queryByText(/Reviewed/)).not.toBeInTheDocument()
})

it('shows a year range', () => {
  renderRow({ start_year: 2018, end_year: 2021 })
  expect(screen.getByText('2018–2021')).toBeInTheDocument()
})

it('shows the rating of an existing review', () => {
  renderRow({ my_review: { id: 7, rating: 9.5 } })
  expect(screen.getByText('Reviewed · 9.5')).toBeInTheDocument()
})

it.each([[null], [[]]])('leaves out the genre line for %j', (genres) => {
  const { container } = renderRow({ genres })
  expect(container.querySelector('li button')?.textContent).toBe(
    'The Witcher 3: Wild Hunt 2015IMDb 9.3',
  )
})

it('leaves out the provider badge without a rating or its name', () => {
  const { unmount } = renderRow({ provider_rating: null })
  expect(screen.getByRole('button')).not.toHaveTextContent('IMDb')
  unmount()

  renderRow({}, vi.fn(), null)
  expect(screen.getByRole('button')).not.toHaveTextContent('9.3')
})

it('calls onSelect with the result', async () => {
  const user = userEvent.setup()
  const { result, onSelect } = renderRow()

  await user.click(screen.getByRole('button'))

  expect(onSelect).toHaveBeenCalledWith(result)
})

it('has no axe violations', async () => {
  const { container } = renderRow({ my_review: { id: 7, rating: 9.5 } })
  await expectNoAxeViolations(container)
})

describe('in the watchlist sheet', () => {
  const dune = {
    id: 'tt1160419',
    category: 'movie' as const,
    title: 'Dune',
    start_year: 2021,
    end_year: null,
  }

  function renderWatchlistRow(
    watchlist: WatchlistRowStatus,
    overrides: Partial<SearchResult> = {},
  ) {
    const onSelect = vi.fn()
    const result = makeSearchResult({ ...dune, ...overrides })
    const view = render(
      <ul>
        <SearchResultRow
          result={result}
          ratingLabel="IMDb"
          watchlist={watchlist}
          onSelect={onSelect}
        />
      </ul>,
    )
    return { ...view, result, onSelect }
  }

  it('offers Add, without the provider badge or the chevron', async () => {
    const user = userEvent.setup()
    const { container, result, onSelect } = renderWatchlistRow({
      status: 'add',
      fresh: false,
    })

    const button = screen.getByRole('button', {
      name: 'Add Dune (2021) to your watchlist',
    })
    expect(button).not.toHaveAttribute('aria-disabled')
    expect(button).toHaveTextContent(
      'Dune 2021Role-playing (RPG), AdventureAdd',
    )
    expect(button).not.toHaveTextContent('IMDb')
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(button).not.toHaveAttribute('data-fresh')

    await user.click(button)
    expect(onSelect).toHaveBeenCalledWith(result)
  })

  it('shows a title added in this sheet as on the watchlist, tinted and inert', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderWatchlistRow({ status: 'on', fresh: true })

    const button = screen.getByRole('button', {
      name: 'Dune (2021) is on your watchlist',
    })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('data-fresh')
    expect(button).toHaveTextContent(/On watchlist$/)

    await user.click(button)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows one already on the list without the tint', () => {
    renderWatchlistRow({ status: 'on', fresh: false })

    const button = screen.getByRole('button', {
      name: 'Dune (2021) is on your watchlist',
    })
    expect(button).not.toHaveAttribute('data-fresh')
  })

  it('shows a reviewed title with its rating, inert', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderWatchlistRow(
      { status: 'reviewed', fresh: false },
      {
        title: 'Elden Ring',
        start_year: 2022,
        my_review: { id: 3, rating: 9.3 },
      },
    )

    const button = screen.getByRole('button', {
      name: 'Elden Ring (2022): already reviewed, 9.3',
    })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Reviewed · 9.3')).toBeInTheDocument()

    await user.click(button)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('says Reviewed without a rating it doesn’t have', () => {
    renderWatchlistRow({ status: 'reviewed', fresh: false })

    expect(
      screen.getByRole('button', { name: 'Dune (2021): already reviewed' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Reviewed')).toBeInTheDocument()
  })

  it('names a year range, or no year', () => {
    const { unmount } = renderWatchlistRow(
      { status: 'add', fresh: false },
      { title: 'Arcane', start_year: 2021, end_year: 2024 },
    )
    expect(
      screen.getByRole('button', {
        name: 'Add Arcane (2021–2024) to your watchlist',
      }),
    ).toBeInTheDocument()
    unmount()

    renderWatchlistRow(
      { status: 'on', fresh: false },
      { start_year: null, end_year: null },
    )
    expect(
      screen.getByRole('button', { name: 'Dune is on your watchlist' }),
    ).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderWatchlistRow({ status: 'on', fresh: true })
    await expectNoAxeViolations(container)
  })
})
