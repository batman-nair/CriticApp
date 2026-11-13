import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { makeSearchResult } from '../../test/fixtures'
import { WriteStep } from './WriteStep'

interface SetupOptions {
  text?: string
  error?: string
  formError?: string | null
}

function setup({ text = '', error, formError = null }: SetupOptions = {}) {
  const props = {
    onChangeItem: vi.fn(),
    onTextChange: vi.fn(),
    onRetry: vi.fn(),
    onSubmit: vi.fn(),
  }

  function Harness() {
    const [value, setValue] = useState(text)
    return (
      <WriteStep
        id="write"
        item={makeSearchResult()}
        ratingLabel="IGDB"
        rating={7.5}
        text={value}
        error={error}
        formError={formError}
        retrying={false}
        {...props}
        onTextChange={(next) => {
          props.onTextChange(next)
          setValue(next)
        }}
      />
    )
  }

  const view = render(<Harness />)
  return { ...view, ...props, user: userEvent.setup() }
}

const notes = () => screen.getByRole('textbox', { name: 'In a line or two' })

it('shows the picked title and the rating given', () => {
  const { container } = setup()

  expect(screen.getByText('The Witcher 3: Wild Hunt')).toBeInTheDocument()
  // By the field and on the card: CSS shows one of the two.
  expect(container).toHaveTextContent(
    /Your rating 7\.5.*In a line or two.*Your rating 7\.5/,
  )
  expect(notes()).toHaveAttribute(
    'placeholder',
    'e.g. “Way more fun than it had any right to be.”',
  )
})

it('starts in the text', () => {
  setup()

  expect(notes()).toHaveFocus()
})

it('counts the text against 5000 and sends it up', async () => {
  const { user, onTextChange } = setup({ text: 'Fun' })

  expect(notes()).toHaveValue('Fun')
  expect(screen.getByText('3 / 5000')).toBeInTheDocument()
  await user.type(notes(), '!')
  expect(onTextChange).toHaveBeenLastCalledWith('Fun!')
  expect(screen.getByText('4 / 5000')).toBeInTheDocument()
})

it('calls onChangeItem from Change', async () => {
  const { user, onChangeItem } = setup()

  await user.click(screen.getByRole('button', { name: 'Change' }))

  expect(onChangeItem).toHaveBeenCalledOnce()
})

it('shows the server’s message under the text', () => {
  setup({ error: 'Too long.' })

  expect(notes()).toHaveAccessibleDescription(
    expect.stringContaining('Too long.'),
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows a message for the whole save, with Try again', async () => {
  const { user, onRetry } = setup({ formError: 'Couldn’t save. Try again.' })

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Couldn’t save. Try again.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(onRetry).toHaveBeenCalledOnce()
})

it('submits the form for the footer’s button', () => {
  const { onSubmit } = setup()

  ;(document.getElementById('write') as HTMLFormElement).requestSubmit()

  expect(onSubmit).toHaveBeenCalledOnce()
})

it('has no axe violations', async () => {
  const { container } = setup({
    error: 'Too long.',
    formError: 'Couldn’t save. Try again.',
  })
  await expectNoAxeViolations(container)
})
