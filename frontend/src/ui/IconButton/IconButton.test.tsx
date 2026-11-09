import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { expect, it, vi } from 'vitest'
import { Icon } from '../Icon/Icon'
import { IconButton } from './IconButton'

const icon = <Icon name="x" />

it('exposes its label as the accessible name', () => {
  render(<IconButton label="Close">{icon}</IconButton>)

  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
})

it('prefers label over a stray aria-label', () => {
  render(
    <IconButton label="Close" aria-label="Dismiss">
      {icon}
    </IconButton>,
  )

  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
})

it.each(['ghost', 'soft', 'outline'] as const)(
  'renders the %s variant',
  (variant) => {
    render(
      <IconButton label="Close" variant={variant} size="sm">
        {icon}
      </IconButton>,
    )

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  },
)

it('defaults to type="button" and lets the caller override it', () => {
  const { rerender } = render(<IconButton label="Close">{icon}</IconButton>)
  expect(screen.getByRole('button')).toHaveAttribute('type', 'button')

  rerender(
    <IconButton label="Close" type="submit">
      {icon}
    </IconButton>,
  )
  expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
})

it('renders the icon and passes native props, ref and className through', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  const ref = createRef<HTMLButtonElement>()
  render(
    <IconButton label="Close" ref={ref} onClick={onClick} className="mine">
      {icon}
    </IconButton>,
  )

  const button = screen.getByRole('button')
  await user.click(button)

  expect(onClick).toHaveBeenCalledOnce()
  expect(ref.current).toBe(button)
  expect(button).toHaveClass('mine')
  expect(button.querySelector('svg')).toBeInTheDocument()
})

it('blocks clicks when disabled', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(
    <IconButton label="Close" disabled onClick={onClick}>
      {icon}
    </IconButton>,
  )

  await user.click(screen.getByRole('button'))

  expect(onClick).not.toHaveBeenCalled()
})
