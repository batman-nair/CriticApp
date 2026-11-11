import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { ReviewListSkeleton } from './ReviewListSkeleton'

it('says it is loading, and hides the placeholder cards', () => {
  const { container } = render(<ReviewListSkeleton />)

  expect(screen.getByRole('status')).toHaveTextContent('Loading your reviews')
  expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
  const cards = container.querySelector('[aria-hidden="true"]')
  expect(cards?.childElementCount).toBe(6)
})

it('has no axe violations', async () => {
  const { container } = render(<ReviewListSkeleton />)

  await expectNoAxeViolations(container)
})
