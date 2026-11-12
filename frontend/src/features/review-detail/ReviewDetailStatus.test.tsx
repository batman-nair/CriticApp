import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { ReviewDetailStatus } from './ReviewDetailStatus'

it('says the review is not there', () => {
  render(<ReviewDetailStatus kind="not-found" onAction={() => {}} />)

  expect(
    screen.getByRole('heading', { level: 2, name: 'Review not found' }),
  ).toBeInTheDocument()
  expect(screen.getByText('It may have been deleted.')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('goes back to the list from "Back to the list"', async () => {
  const user = userEvent.setup()
  const onAction = vi.fn()
  render(<ReviewDetailStatus kind="not-found" onAction={onAction} />)

  await user.click(screen.getByRole('button', { name: 'Back to the list' }))

  expect(onAction).toHaveBeenCalledOnce()
})

it('alerts that the review failed to load', () => {
  render(<ReviewDetailStatus kind="error" onAction={() => {}} />)

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Couldn’t load this review.',
  )
  expect(
    screen.queryByRole('button', { name: 'Back to the list' }),
  ).not.toBeInTheDocument()
})

it('retries from "Try again"', async () => {
  const user = userEvent.setup()
  const onAction = vi.fn()
  render(<ReviewDetailStatus kind="error" onAction={onAction} />)

  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(onAction).toHaveBeenCalledOnce()
})

it.each(['not-found', 'error'] as const)(
  'has no axe violations (%s)',
  async (kind) => {
    const { container } = render(
      <ReviewDetailStatus kind={kind} onAction={() => {}} />,
    )

    await expectNoAxeViolations(container)
  },
)
