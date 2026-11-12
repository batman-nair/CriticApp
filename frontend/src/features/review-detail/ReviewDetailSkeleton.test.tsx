import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { ReviewDetailSkeleton } from './ReviewDetailSkeleton'

it('says it is loading, and hides the placeholder', () => {
  const { container } = render(<ReviewDetailSkeleton />)

  expect(screen.getByRole('status')).toHaveTextContent('Loading the review')
  expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  expect(
    container.querySelector('[aria-hidden="true"]')?.childElementCount,
  ).toBe(3)
})

it('has no axe violations', async () => {
  const { container } = render(<ReviewDetailSkeleton />)

  await expectNoAxeViolations(container)
})
