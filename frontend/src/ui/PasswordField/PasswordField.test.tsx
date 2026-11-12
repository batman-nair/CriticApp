import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { PasswordField } from './PasswordField'

function input() {
  return screen.getByLabelText('Password')
}

it('associates the label with a password input', () => {
  render(<PasswordField label="Password" />)

  expect(input().tagName).toBe('INPUT')
  expect(input()).toHaveAttribute('type', 'password')
  expect(input().id).not.toBe('')
})

it('uses the id the caller gives', () => {
  render(<PasswordField label="Password" id="login-password" />)

  expect(input()).toHaveAttribute('id', 'login-password')
})

it('shows and hides the password', async () => {
  const user = userEvent.setup()
  render(<PasswordField label="Password" />)
  const toggle = screen.getByRole('button', { name: 'Show' })
  expect(toggle).toHaveAttribute('type', 'button')
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(toggle).toHaveAttribute('aria-controls', input().id)

  await user.click(toggle)
  expect(input()).toHaveAttribute('type', 'text')
  expect(toggle).toHaveAccessibleName('Hide')
  expect(toggle).toHaveAttribute('aria-pressed', 'true')

  await user.click(toggle)
  expect(input()).toHaveAttribute('type', 'password')
  expect(toggle).toHaveAccessibleName('Show')
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
})

it('doesn’t submit a form from the toggle', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault())
  render(
    <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
      <PasswordField label="Password" />
    </form>,
  )

  await user.click(screen.getByRole('button', { name: 'Show' }))

  expect(onSubmit).not.toHaveBeenCalled()
})

it('has no error wiring without an error', () => {
  render(<PasswordField label="Password" />)

  expect(input()).not.toHaveAttribute('aria-invalid')
  expect(input()).not.toHaveAttribute('aria-describedby')
})

it('links an error to the input', () => {
  render(<PasswordField label="Password" error="Enter your password." />)

  expect(input()).toHaveAttribute('aria-invalid', 'true')
  expect(input()).toHaveAccessibleDescription('Enter your password.')
})

it('appends the error after a caller description', () => {
  render(
    <>
      <span id="hint">At least 8 characters</span>
      <PasswordField
        label="Password"
        error="Required"
        aria-describedby="hint"
      />
    </>,
  )

  expect(input()).toHaveAccessibleDescription('At least 8 characters Required')
})

it('keeps the caller aria-invalid when there is no error', () => {
  render(<PasswordField label="Password" aria-invalid="true" />)

  expect(input()).toHaveAttribute('aria-invalid', 'true')
})

it('passes native props and ref to the input', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const ref = createRef<HTMLInputElement>()
  render(
    <PasswordField
      ref={ref}
      label="Password"
      autoComplete="current-password"
      onChange={onChange}
    />,
  )

  await user.type(input(), 'a')

  expect(onChange).toHaveBeenCalledOnce()
  expect(ref.current).toBe(input())
  expect(input()).toHaveAttribute('autocomplete', 'current-password')
})

it('disables the toggle with the input', () => {
  render(<PasswordField label="Password" disabled />)

  expect(input()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Show' })).toBeDisabled()
})

it('has no axe violations, shown and with an error', async () => {
  const user = userEvent.setup()
  const { container } = render(
    <PasswordField label="Password" error="Enter your password." />,
  )
  await expectNoAxeViolations(container)

  await user.click(screen.getByRole('button', { name: 'Show' }))
  await expectNoAxeViolations(container)
})
