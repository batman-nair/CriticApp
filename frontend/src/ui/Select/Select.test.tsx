import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { Select } from './Select'

const options = [
  { value: '', label: 'Any language' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
]

function ControlledSelect({
  initial,
  onValueChange,
}: {
  initial: string
  onValueChange: (value: string) => void
}) {
  const [value, setValue] = useState(initial)

  return (
    <Select
      label="Language"
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onValueChange(next)
      }}
      options={options}
    />
  )
}

const trigger = () => screen.getByRole('combobox', { name: 'Language' })

it('shows the label of the current value', () => {
  render(
    <Select
      label="Language"
      value="ja"
      onValueChange={() => {}}
      options={options}
    />,
  )

  expect(trigger()).toHaveTextContent(/^Japanese$/)
})

it('opens, moves and selects with the keyboard, then returns focus', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  render(<ControlledSelect initial="en" onValueChange={onValueChange} />)

  await user.tab()
  expect(trigger()).toHaveFocus()

  await user.keyboard('{Enter}')
  const english = await screen.findByRole('option', { name: 'English' })
  await waitFor(() => expect(english).toHaveFocus())

  await user.keyboard('{ArrowDown}')
  expect(screen.getByRole('option', { name: 'Japanese' })).toHaveFocus()

  await user.keyboard('{Enter}')

  expect(onValueChange).toHaveBeenCalledExactlyOnceWith('ja')
  await waitFor(() => expect(trigger()).toHaveFocus())
  expect(trigger()).toHaveTextContent(/^Japanese$/)
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

it('selects with the pointer', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  render(<ControlledSelect initial="en" onValueChange={onValueChange} />)

  await user.click(trigger())
  await user.click(await screen.findByRole('option', { name: 'Japanese' }))

  expect(onValueChange).toHaveBeenCalledExactlyOnceWith('ja')
  expect(trigger()).toHaveTextContent(/^Japanese$/)
})

it('displays an empty-string option as the current value', () => {
  render(
    <Select
      label="Language"
      value=""
      onValueChange={() => {}}
      options={options}
    />,
  )

  expect(trigger()).toHaveTextContent(/^Any language$/)
})

it('reports an empty-string option as an empty string', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  render(<ControlledSelect initial="en" onValueChange={onValueChange} />)

  await user.click(trigger())
  await user.click(await screen.findByRole('option', { name: 'Any language' }))

  expect(onValueChange).toHaveBeenCalledExactlyOnceWith('')
  expect(trigger()).toHaveTextContent(/^Any language$/)
})

it('marks the current option as selected, including an empty-string one', async () => {
  const user = userEvent.setup()
  render(<ControlledSelect initial="" onValueChange={() => {}} />)

  await user.click(trigger())

  expect(
    await screen.findByRole('option', { name: 'Any language' }),
  ).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute(
    'aria-selected',
    'false',
  )
})

it('does not open when disabled', async () => {
  const user = userEvent.setup()
  render(
    <Select
      label="Language"
      value="en"
      onValueChange={() => {}}
      options={options}
      disabled
    />,
  )

  expect(trigger()).toBeDisabled()
  await user.click(trigger())

  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

it('has no axe violations on the open list', async () => {
  const user = userEvent.setup()
  render(<ControlledSelect initial="en" onValueChange={() => {}} />)

  await user.click(trigger())

  // Not document.body: axe's region rule misfires on a portaled popup.
  await expectNoAxeViolations(await screen.findByRole('listbox'))
})
