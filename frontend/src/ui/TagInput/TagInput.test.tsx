import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState, type ComponentProps } from 'react'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { TagInput } from './TagInput'
import styles from './TagInput.module.css'

type HarnessProps = Omit<
  ComponentProps<typeof TagInput>,
  'label' | 'value' | 'onValueChange'
> & {
  initial?: string[]
  onValueChange?: (tags: string[]) => void
}

function Harness({ initial = [], onValueChange, ...rest }: HarnessProps) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <TagInput
        {...rest}
        label="Tags"
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onValueChange?.(next)
        }}
      />
      <button type="button" onClick={() => setValue(['dune'])}>
        Load dune
      </button>
      <button type="button" onClick={() => setValue(['Sci-Fi'])}>
        Respell
      </button>
      <button type="button" onClick={() => setValue([])}>
        Reset
      </button>
    </>
  )
}

function numberedTags(count: number) {
  return Array.from({ length: count }, (_, index) => `t${index}`)
}

function textbox() {
  return screen.getByRole('textbox')
}

function chip(tag: string) {
  return screen.getByRole('button', { name: `+ ${tag}` })
}

function queryChip(tag: string) {
  return screen.queryByRole('button', { name: `+ ${tag}` })
}

it('reports the parsed list and keeps the exact text while typing', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  render(<Harness onValueChange={onValueChange} />)

  await user.type(textbox(), 'sci-fi, Fav')

  expect(onValueChange).toHaveBeenLastCalledWith(['sci-fi', 'Fav'])
  expect(textbox()).toHaveValue('sci-fi, Fav')
})

it('keeps a trailing separator in the text', async () => {
  const user = userEvent.setup()
  render(<Harness />)

  await user.type(textbox(), 'sci-fi, ')

  expect(textbox()).toHaveValue('sci-fi, ')
})

it('does not report a change for typing only a separator', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  render(<Harness initial={['sci-fi']} onValueChange={onValueChange} />)

  await user.type(textbox(), ', ')

  expect(onValueChange).not.toHaveBeenCalled()
  expect(textbox()).toHaveValue('sci-fi, ')
})

it('shows a value that is not normalised as given, without reporting it', () => {
  const onValueChange = vi.fn()
  render(<Harness initial={['a', 'A', 'b,c']} onValueChange={onValueChange} />)

  expect(textbox()).toHaveValue('a, A, b,c')
  expect(onValueChange).not.toHaveBeenCalled()
})

it('replaces the draft when the parent changes the value', async () => {
  const user = userEvent.setup()
  render(<Harness />)

  await user.type(textbox(), 'sci-fi, ')
  await user.click(screen.getByRole('button', { name: 'Load dune' }))

  expect(textbox()).toHaveValue('dune')
})

it('replaces the draft when the parent resets to an empty list', async () => {
  const user = userEvent.setup()
  render(<Harness />)

  await user.type(textbox(), 'sci-fi, ')
  await user.click(screen.getByRole('button', { name: 'Reset' }))

  expect(textbox()).toHaveValue('')
})

it('shows a spelling changed by the parent', async () => {
  const user = userEvent.setup()
  render(<Harness />)

  await user.type(textbox(), 'sci-fi')
  await user.click(screen.getByRole('button', { name: 'Respell' }))

  expect(textbox()).toHaveValue('Sci-Fi')
})

it('adds a clicked suggestion and updates the text', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  render(
    <Harness
      initial={['sci-fi']}
      suggestions={['favourite']}
      onValueChange={onValueChange}
    />,
  )

  await user.click(chip('favourite'))

  expect(onValueChange.mock.calls).toEqual([[['sci-fi', 'favourite']]])
  expect(textbox()).toHaveValue('sci-fi, favourite')
})

it('hides used suggestions, case-insensitively', () => {
  render(
    <Harness initial={['Favourite']} suggestions={['favourite', 'rewatch']} />,
  )

  expect(queryChip('favourite')).not.toBeInTheDocument()
  expect(chip('rewatch')).toBeInTheDocument()
})

it('hides a suggestion once it has been typed', async () => {
  const user = userEvent.setup()
  render(<Harness suggestions={['favourite']} />)

  await user.type(textbox(), 'FAVOURITE')

  expect(queryChip('favourite')).not.toBeInTheDocument()
})

it('renders a repeated suggestion once', () => {
  render(<Harness suggestions={['rewatch', 'Rewatch']} />)

  expect(screen.getAllByRole('button', { name: /^\+ / })).toHaveLength(1)
  expect(chip('rewatch')).toBeInTheDocument()
})

it('renders no suggestions wrapper when none are visible', () => {
  render(<Harness initial={['rewatch']} suggestions={['rewatch']} />)

  expect(textbox().nextElementSibling).toBeNull()
})

it('moves keyboard focus to the next chip, then to the input', async () => {
  const user = userEvent.setup()
  render(<Harness suggestions={['first', 'last']} />)

  chip('first').focus()
  await user.keyboard('{Enter}')
  expect(chip('last')).toHaveFocus()

  await user.keyboard(' ')
  expect(textbox()).toHaveFocus()
  expect(textbox()).toHaveValue('first, last')
})

it('moves keyboard focus to the previous chip from the last one', async () => {
  const user = userEvent.setup()
  render(<Harness suggestions={['first', 'last']} />)

  chip('last').focus()
  await user.keyboard('{Enter}')

  expect(chip('first')).toHaveFocus()
})

it('does not focus the input on pointer activation', async () => {
  const user = userEvent.setup()
  render(<Harness suggestions={['only']} />)

  await user.click(chip('only'))

  expect(textbox()).not.toHaveFocus()
})

it.each([
  ['more than 10 tags', numberedTags(11), 'Use at most 10 tags.'],
  [
    'a tag over 50 characters',
    ['a'.repeat(51)],
    'Each tag can be at most 50 characters.',
  ],
  [
    'characters outside the rule',
    ['sci fi'],
    'Tags can only use letters, numbers and hyphens, separated by commas.',
  ],
  [
    'more than 100 joined characters',
    ['a'.repeat(50), 'b'.repeat(50)],
    'Together, the tags can be at most 100 characters, counting the commas.',
  ],
])('shows the message for %s', (_name, initial, message) => {
  render(<Harness initial={initial} />)

  expect(screen.getByText(message)).toBeInTheDocument()
  expect(textbox()).toHaveAttribute('aria-invalid', 'true')
  expect(textbox()).toHaveAccessibleDescription(message)
})

it('clears the message once the tags are fixed', async () => {
  const user = userEvent.setup()
  render(<Harness initial={['sci fi']} />)
  expect(textbox()).toHaveAttribute('aria-invalid', 'true')

  await user.clear(textbox())
  await user.type(textbox(), 'sci-fi')

  expect(textbox()).not.toHaveAttribute('aria-invalid')
  expect(textbox()).not.toHaveAccessibleDescription()
  expect(screen.queryByText(/letters, numbers/)).not.toBeInTheDocument()
})

it('shows a server error when the client rules pass', () => {
  render(<Harness initial={['sci-fi']} error="Could not save the tags." />)

  expect(textbox()).toHaveAttribute('aria-invalid', 'true')
  expect(textbox()).toHaveAccessibleDescription('Could not save the tags.')
})

it('shows a client message over a server error', () => {
  render(<Harness initial={['sci fi']} error="Could not save the tags." />)

  expect(screen.getByText(/letters, numbers/)).toBeInTheDocument()
  expect(screen.queryByText('Could not save the tags.')).not.toBeInTheDocument()
})

it('treats an empty error as no error', () => {
  render(<Harness initial={['sci-fi']} error="" />)

  expect(textbox()).not.toHaveAttribute('aria-invalid')
  expect(textbox()).not.toHaveAttribute('aria-describedby')
})

it('merges the caller’s describedby with the error', () => {
  render(<Harness initial={['sci fi']} id="tags" aria-describedby="hint" />)

  expect(textbox()).toHaveAttribute('aria-describedby', 'hint tags-error')
})

it('adds the optional marker to the accessible name', () => {
  render(<Harness optional />)

  expect(
    screen.getByRole('textbox', { name: 'Tags (optional)' }),
  ).toBeInTheDocument()
})

it.each(['stacked', 'inline'] as const)('applies the %s layout', (layout) => {
  const { container } = render(<Harness layout={layout} />)

  expect(container.firstElementChild).toHaveClass(styles[layout]!)
})

it('uses the stacked layout by default', () => {
  const { container } = render(<Harness />)

  expect(container.firstElementChild).toHaveClass(styles.stacked!)
})

it('disables the input and the suggestions', () => {
  render(<Harness suggestions={['favourite']} disabled />)

  expect(textbox()).toBeDisabled()
  expect(chip('favourite')).toBeDisabled()
})

it('passes native props and className to the input and forwards the ref', () => {
  const ref = createRef<HTMLInputElement>()
  render(<Harness ref={ref} name="tags" className="custom" />)

  expect(ref.current).toBe(textbox())
  expect(textbox()).toHaveAttribute('name', 'tags')
  expect(textbox()).toHaveClass('custom')
})

it('has a default placeholder the caller can override', () => {
  const { unmount } = render(<Harness />)
  expect(textbox()).toHaveAttribute('placeholder', 'e.g. sci-fi, favourite')
  unmount()

  render(<Harness placeholder="Add tags" />)
  expect(textbox()).toHaveAttribute('placeholder', 'Add tags')
})

it('turns autocomplete off unless the caller overrides it', () => {
  const { unmount } = render(<Harness />)
  expect(textbox()).toHaveAttribute('autocomplete', 'off')
  unmount()

  render(<Harness autoComplete="on" />)
  expect(textbox()).toHaveAttribute('autocomplete', 'on')
})

it('has no axe violations with an error and suggestions', async () => {
  const { container } = render(
    <Harness initial={['sci fi']} suggestions={['favourite', 'rewatch']} />,
  )

  await expectNoAxeViolations(container)
})
