import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { SearchResult } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeSearchResult } from '../../test/fixtures'
import { SelectedItem } from './SelectedItem'

interface SetupOptions {
  item?: Partial<SearchResult>
  ratingLabel?: string | null
  rating?: number
}

function setup({ item, ratingLabel = 'IGDB', rating }: SetupOptions = {}) {
  const onChange = vi.fn()
  const view = render(
    <SelectedItem
      item={makeSearchResult(item)}
      ratingLabel={ratingLabel}
      rating={rating}
      onChange={onChange}
    />,
  )
  return { ...view, onChange, user: userEvent.setup() }
}

it('shows the title, years, category, genres and provider rating', () => {
  const { container } = setup({ item: { end_year: 2016 } })

  expect(screen.getByText('2015–2016')).toBeInTheDocument()
  expect(container).toHaveTextContent('The Witcher 3: Wild Hunt 2015–2016')
  expect(container).toHaveTextContent('Games · Role-playing (RPG), Adventure')
  expect(screen.getByText('IGDB 9.3')).toBeInTheDocument()
  expect(container).not.toHaveTextContent('Your rating')
})

it.each([[null], [[]]])('leaves out the genres for %j', (genres) => {
  const { container } = setup({ item: { genres } })

  expect(container).not.toHaveTextContent('·')
})

it('leaves out the provider badge without a rating or its name', () => {
  const { container, unmount } = setup({ item: { provider_rating: null } })
  expect(container).not.toHaveTextContent('IGDB')
  unmount()

  setup({ ratingLabel: null })
  expect(screen.queryByText(/9\.3/)).not.toBeInTheDocument()
})

it('shows the rating given so far', () => {
  setup({ rating: 7.5 })

  expect(screen.getByText('Your rating 7.5')).toBeInTheDocument()
})

it('calls onChange from Change', async () => {
  const { user, onChange } = setup()

  await user.click(screen.getByRole('button', { name: 'Change' }))

  expect(onChange).toHaveBeenCalledOnce()
})

it('has no axe violations', async () => {
  const { container } = setup({ rating: 7.5 })
  await expectNoAxeViolations(container)
})
