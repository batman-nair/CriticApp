import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { WatchlistNoResults } from './WatchlistNoResults'

it('says nothing matches and how to widen the search', () => {
  render(<WatchlistNoResults />)

  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'Nothing on your watchlist matches',
    }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Try another word, or widen the category or language.'),
  ).toBeInTheDocument()
})

it('has no axe violations', async () => {
  const { container } = render(<WatchlistNoResults />)

  await expectNoAxeViolations(container)
})
