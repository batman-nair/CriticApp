import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { TextField } from './TextField'

it('associates the label with a generated id', () => {
  render(<TextField label="Title" />)

  const input = screen.getByLabelText('Title')
  expect(input.tagName).toBe('INPUT')
  expect(input.id).not.toBe('')
})

it('uses the id the caller gives', () => {
  render(<TextField label="Title" id="review-title" />)

  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
    'id',
    'review-title',
  )
})

it('has no error wiring without an error', () => {
  render(<TextField label="Title" />)

  const input = screen.getByRole('textbox', { name: 'Title' })
  expect(input).not.toHaveAttribute('aria-invalid')
  expect(input).not.toHaveAttribute('aria-describedby')
})

it('treats an empty error as no error', () => {
  const { container } = render(<TextField label="Title" error="" />)

  const input = screen.getByRole('textbox', { name: 'Title' })
  expect(input).not.toHaveAttribute('aria-invalid')
  expect(input).not.toHaveAttribute('aria-describedby')
  expect(container.querySelector('p')).not.toBeInTheDocument()
})

it('links an error to the input', () => {
  render(<TextField label="Title" error="Required" />)

  const input = screen.getByRole('textbox', { name: 'Title' })
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAccessibleDescription('Required')
})

it('appends the error after a caller description', () => {
  render(
    <>
      <span id="hint">Shown publicly</span>
      <TextField label="Title" error="Required" aria-describedby="hint" />
    </>,
  )

  const input = screen.getByRole('textbox', { name: 'Title' })
  expect(input).toHaveAttribute(
    'aria-describedby',
    `hint ${screen.getByText('Required').id}`,
  )
  expect(input).toHaveAccessibleDescription('Shown publicly Required')
})

it('keeps the caller aria props when there is no error', () => {
  render(
    <>
      <span id="hint">Shown publicly</span>
      <TextField label="Title" aria-invalid="true" aria-describedby="hint" />
    </>,
  )

  const input = screen.getByRole('textbox', { name: 'Title' })
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAccessibleDescription('Shown publicly')
})

it('passes native props, ref and className through', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const ref = createRef<HTMLInputElement>()
  render(
    <TextField
      ref={ref}
      label="Title"
      placeholder="Dune"
      className="mine"
      onChange={onChange}
    />,
  )

  const input = screen.getByRole('textbox', { name: 'Title' })
  await user.type(input, 'a')

  expect(onChange).toHaveBeenCalledOnce()
  expect(ref.current).toBe(input)
  expect(input).toHaveAttribute('placeholder', 'Dune')
  expect(input).toHaveClass('mine')
})

it('has no axe violations with an error', async () => {
  const { container } = render(<TextField label="Title" error="Required" />)

  await expectNoAxeViolations(container)
})
