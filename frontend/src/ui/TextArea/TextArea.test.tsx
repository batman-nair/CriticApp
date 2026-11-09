import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { expect, it, vi } from 'vitest'
import { cx } from '../../lib/cx'
import { expectNoAxeViolations } from '../../test/axe'
import { TextArea } from './TextArea'
import styles from './TextArea.module.css'

it('associates the label with a generated id', () => {
  render(<TextArea label="Notes" value="" readOnly />)

  const textarea = screen.getByLabelText('Notes')
  expect(textarea.tagName).toBe('TEXTAREA')
  expect(textarea.id).not.toBe('')
})

it('uses the id the caller gives', () => {
  render(<TextArea label="Notes" id="review-notes" value="" readOnly />)

  expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute(
    'id',
    'review-notes',
  )
})

it('defaults to 3 rows and lets the caller override it', () => {
  const { rerender } = render(<TextArea label="Notes" value="" readOnly />)
  const textarea = screen.getByRole('textbox', { name: 'Notes' })
  expect(textarea).toHaveAttribute('rows', '3')

  rerender(<TextArea label="Notes" value="" rows={6} readOnly />)
  expect(textarea).toHaveAttribute('rows', '6')
})

it('has no error or counter wiring without them', () => {
  render(<TextArea label="Notes" value="abc" readOnly />)

  const textarea = screen.getByRole('textbox', { name: 'Notes' })
  expect(textarea).not.toHaveAttribute('aria-invalid')
  expect(textarea).not.toHaveAttribute('aria-describedby')
  expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument()
})

it('treats an empty error as no error', () => {
  const { container } = render(
    <TextArea label="Notes" value="" error="" readOnly />,
  )

  const textarea = screen.getByRole('textbox', { name: 'Notes' })
  expect(textarea).not.toHaveAttribute('aria-invalid')
  expect(textarea).not.toHaveAttribute('aria-describedby')
  expect(container.querySelector('p')).not.toBeInTheDocument()
})

it('links an error to the textarea', () => {
  render(<TextArea label="Notes" value="" error="Too long" readOnly />)

  const textarea = screen.getByRole('textbox', { name: 'Notes' })
  expect(textarea).toHaveAttribute('aria-invalid', 'true')
  expect(textarea).toHaveAccessibleDescription('Too long')
})

it('keeps the caller aria props when there is no error', () => {
  render(
    <>
      <span id="hint">Spoilers are fine</span>
      <TextArea
        label="Notes"
        value=""
        aria-invalid="true"
        aria-describedby="hint"
        readOnly
      />
    </>,
  )

  const textarea = screen.getByRole('textbox', { name: 'Notes' })
  expect(textarea).toHaveAttribute('aria-invalid', 'true')
  expect(textarea).toHaveAccessibleDescription('Spoilers are fine')
})

it('shows the count against the limit', () => {
  render(<TextArea label="Notes" value="abc" counterMax={200} readOnly />)

  expect(screen.getByText('3 / 200')).toBeInTheDocument()
  expect(
    screen.getByRole('textbox', { name: 'Notes' }),
  ).toHaveAccessibleDescription('3 / 200')
})

it('shows a counter with a limit of 0', () => {
  render(<TextArea label="Notes" value="" counterMax={0} readOnly />)

  expect(screen.getByText('0 / 0')).toBeInTheDocument()
})

it('warns only above the limit', () => {
  const { rerender } = render(
    <TextArea label="Notes" value="abc" counterMax={4} readOnly />,
  )
  expect(screen.getByText('3 / 4').className).toBe(styles.counter)

  rerender(<TextArea label="Notes" value="abcd" counterMax={4} readOnly />)
  expect(screen.getByText('4 / 4').className).toBe(styles.counter)

  rerender(<TextArea label="Notes" value="abcde" counterMax={4} readOnly />)
  expect(screen.getByText('5 / 4').className).toBe(
    cx(styles.counter, styles.over),
  )
})

it('counts an emoji as one character, as the backend does', () => {
  render(<TextArea label="Notes" value="😀😀" counterMax={2} readOnly />)

  expect(screen.getByText('2 / 2').className).toBe(styles.counter)
})

it('never sets maxLength from the counter', () => {
  render(<TextArea label="Notes" value="abcde" counterMax={4} readOnly />)

  expect(screen.getByRole('textbox', { name: 'Notes' })).not.toHaveAttribute(
    'maxlength',
  )
})

it('has no live region on the counter', () => {
  render(<TextArea label="Notes" value="abc" counterMax={4} readOnly />)

  const counter = screen.getByText('3 / 4')
  expect(counter).not.toHaveAttribute('aria-live')
  expect(counter).not.toHaveAttribute('role')
})

it('joins the caller, counter and error descriptions in order', () => {
  render(
    <>
      <span id="hint">Spoilers are fine</span>
      <TextArea
        label="Notes"
        value="abcde"
        counterMax={4}
        error="Too long"
        aria-describedby="hint"
        readOnly
      />
    </>,
  )

  const textarea = screen.getByRole('textbox', { name: 'Notes' })
  const counterId = screen.getByText('5 / 4').id
  const errorId = screen.getByText('Too long').id
  expect(textarea).toHaveAttribute(
    'aria-describedby',
    `hint ${counterId} ${errorId}`,
  )
  expect(textarea).toHaveAccessibleDescription(
    'Spoilers are fine 5 / 4 Too long',
  )
})

it('passes native props, ref and className through', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const ref = createRef<HTMLTextAreaElement>()
  render(
    <TextArea
      ref={ref}
      label="Notes"
      value=""
      placeholder="Thoughts"
      className="mine"
      onChange={onChange}
    />,
  )

  const textarea = screen.getByRole('textbox', { name: 'Notes' })
  await user.type(textarea, 'a')

  expect(onChange).toHaveBeenCalledOnce()
  expect(ref.current).toBe(textarea)
  expect(textarea).toHaveAttribute('placeholder', 'Thoughts')
  expect(textarea).toHaveClass('mine')
})

it('has no axe violations with an error and a counter', async () => {
  const { container } = render(
    <TextArea
      label="Notes"
      value="abcde"
      counterMax={4}
      error="Too long"
      readOnly
    />,
  )

  await expectNoAxeViolations(container)
})
