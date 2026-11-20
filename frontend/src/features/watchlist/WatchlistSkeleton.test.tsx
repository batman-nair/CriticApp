import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { WatchlistSkeleton } from './WatchlistSkeleton'

it('says it is loading, and hides the placeholder cards', () => {
  const { container } = render(<WatchlistSkeleton />)

  expect(screen.getByRole('status')).toHaveTextContent('Loading your watchlist')
  expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
  const cards = container.querySelector('[aria-hidden="true"]')
  expect(cards?.childElementCount).toBe(10)
})

it('has no axe violations', async () => {
  const { container } = render(<WatchlistSkeleton />)

  await expectNoAxeViolations(container)
})
