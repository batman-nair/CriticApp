import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { SaveError } from './SaveError'

it('shows the message and tries again', async () => {
  const user = userEvent.setup()
  const onRetry = vi.fn()
  render(<SaveError message="Failed." retrying={false} onRetry={onRetry} />)

  expect(screen.getByRole('alert')).toHaveTextContent('Failed.')
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(onRetry).toHaveBeenCalledOnce()
})

it('marks Try again busy while retrying', async () => {
  const user = userEvent.setup()
  const onRetry = vi.fn()
  render(<SaveError message="Failed." retrying onRetry={onRetry} />)

  const button = screen.getByRole('button', { name: 'Try again' })
  expect(button).toHaveAttribute('aria-busy', 'true')
  await user.click(button)
  expect(onRetry).not.toHaveBeenCalled()
})

it('has no axe violations', async () => {
  const { container } = render(
    <SaveError message="Failed." retrying={false} onRetry={vi.fn()} />,
  )
  await expectNoAxeViolations(container)
})
