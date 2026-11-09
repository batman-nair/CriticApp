import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, type FormEvent } from 'react'
import { expect, it, vi } from 'vitest'
import { Button } from './Button'
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass'

const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost']
const sizes: ButtonSize[] = ['sm', 'md', 'lg']
const combinations = variants.flatMap((variant) =>
  sizes.map((size) => ({ variant, size })),
)

it.each(combinations)(
  'renders $variant $size as a named button',
  ({ variant, size }) => {
    render(
      <Button variant={variant} size={size}>
        Save
      </Button>,
    )

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  },
)

it('defaults to type="button"', () => {
  render(<Button>Save</Button>)

  expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
})

it('lets the caller override type', () => {
  render(<Button type="submit">Save</Button>)

  expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
})

it('calls onClick and passes native props and ref through', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  const ref = createRef<HTMLButtonElement>()
  render(
    <Button ref={ref} onClick={onClick} data-testid="save">
      Save
    </Button>,
  )

  const button = screen.getByTestId('save')
  await user.click(button)

  expect(onClick).toHaveBeenCalledOnce()
  expect(ref.current).toBe(button)
})

it('does not mark an idle button as busy', () => {
  render(<Button>Save</Button>)

  const button = screen.getByRole('button')
  expect(button).not.toHaveAttribute('aria-busy')
  expect(button).not.toHaveAttribute('aria-disabled')
  expect(button.querySelector('[aria-hidden="true"]')).toBeNull()
})

it('blocks clicks when disabled', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(
    <Button disabled onClick={onClick}>
      Save
    </Button>,
  )

  const button = screen.getByRole('button')
  await user.click(button)

  expect(button).toBeDisabled()
  expect(onClick).not.toHaveBeenCalled()
})

it('marks a busy button and keeps its accessible name', () => {
  render(<Button busy>Save</Button>)

  const button = screen.getByRole('button', { name: 'Save' })
  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(button).toHaveAttribute('aria-disabled', 'true')
  expect(button.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
})

it('keeps focus when it becomes busy', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<Button>Save</Button>)

  const button = screen.getByRole('button')
  await user.click(button)
  rerender(<Button busy>Save</Button>)

  expect(button).toBeEnabled()
  expect(button).toHaveFocus()
})

it('does not call onClick while busy', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(
    <Button busy onClick={onClick}>
      Save
    </Button>,
  )

  await user.click(screen.getByRole('button'))
  await user.keyboard('{Enter}')

  expect(onClick).not.toHaveBeenCalled()
})

it('does not submit its form while busy', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn((event: FormEvent) => event.preventDefault())
  const form = (busy: boolean) => (
    <form onSubmit={onSubmit}>
      <Button type="submit" busy={busy}>
        Save
      </Button>
    </form>
  )
  const { rerender } = render(form(false))

  await user.click(screen.getByRole('button'))
  expect(onSubmit).toHaveBeenCalledOnce()

  rerender(form(true))
  await user.click(screen.getByRole('button'))
  await user.keyboard('{Enter}')
  expect(onSubmit).toHaveBeenCalledOnce()
})

it('renders the classes buttonClass returns, with the caller className merged', () => {
  render(
    <Button variant="ghost" size="lg" className="mine">
      Save
    </Button>,
  )

  const button = screen.getByRole('button')
  expect(button.className).toBe(
    buttonClass({ variant: 'ghost', size: 'lg', className: 'mine' }),
  )
  expect(button).toHaveClass('mine')
})

it('uses the same defaults in buttonClass as in Button', () => {
  render(<Button>Save</Button>)

  expect(screen.getByRole('button').className).toBe(buttonClass())
  expect(buttonClass()).not.toBe(buttonClass({ variant: 'ghost' }))
  expect(buttonClass()).not.toBe(buttonClass({ size: 'lg' }))
})
