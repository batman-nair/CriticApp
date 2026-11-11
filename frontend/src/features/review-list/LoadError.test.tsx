import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { expectNoAxeViolations } from '../../test/axe'
import { LoadError } from './LoadError'

function apiError(kind: 'http' | 'network', status: number) {
  return new ApiError({ kind, status, code: 'X', detail: 'Failed.' })
}

it('alerts that the reviews failed to load', () => {
  render(<LoadError error={apiError('http', 503)} onRetry={() => {}} />)

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Couldn’t load your reviews',
  )
  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'Couldn’t load your reviews',
    }),
  ).toBeInTheDocument()
})

it('calls onRetry from "Try again"', async () => {
  const user = userEvent.setup()
  const onRetry = vi.fn()
  render(<LoadError error={apiError('http', 503)} onRetry={onRetry} />)

  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(onRetry).toHaveBeenCalledOnce()
})

it('shows the status of an HTTP error', () => {
  render(<LoadError error={apiError('http', 503)} onRetry={() => {}} />)

  expect(screen.getByText('Error 503')).toBeInTheDocument()
})

it.each([
  ['a network error', apiError('network', 0)],
  ['something else', new Error('boom')],
])('shows no status for %s', (_label, error) => {
  render(<LoadError error={error} onRetry={() => {}} />)

  expect(screen.queryByText(/^Error/)).not.toBeInTheDocument()
})

it('has no axe violations', async () => {
  const { container } = render(
    <LoadError error={apiError('http', 503)} onRetry={() => {}} />,
  )

  await expectNoAxeViolations(container)
})
