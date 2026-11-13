import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { SearchResult } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeSearchResult } from '../../test/fixtures'
import { SearchResultRow } from './SearchResultRow'

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
