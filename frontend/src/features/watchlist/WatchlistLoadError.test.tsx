import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { WatchlistLoadError } from './WatchlistLoadError'

it('alerts that the watchlist failed to load', () => {
  render(<WatchlistLoadError onRetry={() => {}} />)

  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('Couldn’t load your watchlist')
  expect(alert).toHaveTextContent(
    'Something went wrong on the way. Check your connection and try again.',
  )
  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'Couldn’t load your watchlist',
    }),
  ).toBeInTheDocument()
})

it('calls onRetry from "Try again"', async () => {
  const user = userEvent.setup()
  const onRetry = vi.fn()
  render(<WatchlistLoadError onRetry={onRetry} />)

  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(onRetry).toHaveBeenCalledOnce()
})

it('has no axe violations', async () => {
  const { container } = render(<WatchlistLoadError onRetry={() => {}} />)

  await expectNoAxeViolations(container)
})
