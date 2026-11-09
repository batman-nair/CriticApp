import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState, type ComponentProps, type FormEvent } from 'react'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { SearchField } from './SearchField'

type HarnessProps = Omit<
  ComponentProps<typeof SearchField>,
  'label' | 'value' | 'onValueChange'
> & {
  initial?: string
  onValueChange?: (value: string) => void
}

function Harness({ initial = '', onValueChange, ...rest }: HarnessProps) {
  const [value, setValue] = useState(initial)
  return (
    <SearchField
      {...rest}
      label="Search reviews"
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onValueChange?.(next)
      }}
    />
  )
}

it('takes its accessible name from the label', () => {
  render(<Harness />)

  const input = screen.getByRole('searchbox', { name: 'Search reviews' })
  expect(input).toHaveAttribute('type', 'search')
  expect(input.id).not.toBe('')
})

it('uses the id the caller gives', () => {
  render(<Harness id="site-search" />)

  expect(screen.getByRole('searchbox')).toHaveAttribute('id', 'site-search')
  expect(screen.getByLabelText('Search reviews')).toHaveAttribute(
    'id',
    'site-search',
  )
})

it('reports typed text through onValueChange', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  render(<Harness onValueChange={onValueChange} />)

  await user.type(screen.getByRole('searchbox'), 'du')

  expect(onValueChange.mock.calls).toEqual([['d'], ['du']])
  expect(screen.getByRole('searchbox')).toHaveValue('du')
})

it('shows the clear button only with a value', async () => {
  const user = userEvent.setup()
  render(<Harness />)

  expect(
    screen.queryByRole('button', { name: 'Clear search' }),
  ).not.toBeInTheDocument()

  await user.type(screen.getByRole('searchbox'), 'd')

  expect(
    screen.getByRole('button', { name: 'Clear search' }),
  ).toBeInTheDocument()
})

it('clears, reports an empty value and returns focus to the input', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  render(<Harness initial="dune" onValueChange={onValueChange} />)

  await user.click(screen.getByRole('button', { name: 'Clear search' }))

  expect(onValueChange.mock.calls).toEqual([['']])
  const input = screen.getByRole('searchbox')
  expect(input).toHaveValue('')
  expect(input).toHaveFocus()
  expect(
    screen.queryByRole('button', { name: 'Clear search' }),
  ).not.toBeInTheDocument()
})

it('uses a custom clear label', () => {
  render(<Harness initial="dune" clearLabel="Reset" />)

  expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
})

it('does not submit a surrounding form when clearing', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn((event: FormEvent) => event.preventDefault())
  render(
    <form onSubmit={onSubmit}>
      <Harness initial="dune" />
    </form>,
  )

  await user.click(screen.getByRole('button', { name: 'Clear search' }))

  expect(onSubmit).not.toHaveBeenCalled()
})

it('disables the clear button along with the input', () => {
  render(<Harness initial="dune" disabled />)

  expect(screen.getByRole('searchbox')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Clear search' })).toBeDisabled()
})

it('turns autocomplete off unless the caller overrides it', () => {
  const { unmount } = render(<Harness />)
  expect(screen.getByRole('searchbox')).toHaveAttribute('autocomplete', 'off')
  unmount()

  render(<Harness autoComplete="on" />)
  expect(screen.getByRole('searchbox')).toHaveAttribute('autocomplete', 'on')
})

it('passes native props through and keeps both refs working', async () => {
  const user = userEvent.setup()
  const ref = createRef<HTMLInputElement>()
  render(<Harness ref={ref} initial="dune" placeholder="Find a title" />)

  const input = screen.getByRole('searchbox')
  expect(ref.current).toBe(input)
  expect(input).toHaveAttribute('placeholder', 'Find a title')

  await user.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(input).toHaveFocus()
})

it('forwards to a callback ref', () => {
  const ref = vi.fn()
  render(<Harness ref={ref} />)

  expect(ref).toHaveBeenCalledWith(screen.getByRole('searchbox'))
})

it.each(['panel', 'sheet'] as const)(
  'has no axe violations in the %s tone with a value',
  async (tone) => {
    const { container } = render(<Harness tone={tone} initial="dune" />)

    await expectNoAxeViolations(container)
  },
)
