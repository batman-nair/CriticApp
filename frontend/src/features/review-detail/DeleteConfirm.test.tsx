import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { DeleteConfirm } from './DeleteConfirm'

function renderConfirm(props: Partial<Parameters<typeof DeleteConfirm>[0]>) {
  return render(
    <DeleteConfirm
      title="Solo Leveling"
      busy={false}
      failed={false}
      onKeep={() => {}}
      onDelete={() => {}}
      {...props}
    />,
  )
}

it('asks before deleting, in a group named by its heading', () => {
  renderConfirm({})

  expect(
    screen.getByRole('group', {
      name: 'Delete your review of Solo Leveling?',
    }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'Delete your review of Solo Leveling?',
    }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Your rating and notes will be removed.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('keeps the review from "Keep it" and deletes it from "Delete review"', async () => {
  const user = userEvent.setup()
  const onKeep = vi.fn()
  const onDelete = vi.fn()
  renderConfirm({ onKeep, onDelete })

  await user.click(screen.getByRole('button', { name: 'Keep it' }))
  expect(onKeep).toHaveBeenCalledOnce()
  expect(onDelete).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Delete review' }))
  expect(onDelete).toHaveBeenCalledOnce()
})

it('hands "Keep it" to keepRef', () => {
  const keepRef = createRef<HTMLButtonElement>()
  renderConfirm({ keepRef })

  expect(keepRef.current).toBe(screen.getByRole('button', { name: 'Keep it' }))
})

it('shows "Delete review" busy while deleting, and ignores clicks', async () => {
  const user = userEvent.setup()
  const onDelete = vi.fn()
  renderConfirm({ busy: true, onDelete })

  const button = screen.getByRole('button', { name: 'Delete review' })
  expect(button).toHaveAttribute('aria-busy', 'true')
  await user.click(button)
  expect(onDelete).not.toHaveBeenCalled()
})

it('alerts that the delete failed, keeping both buttons', () => {
  renderConfirm({ failed: true })

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Couldn’t delete. Try again.',
  )
  expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Delete review' }),
  ).toBeInTheDocument()
})

it.each([
  ['asking', {}],
  ['failed', { failed: true }],
])('has no axe violations (%s)', async (_, props) => {
  const { container } = renderConfirm(props)

  await expectNoAxeViolations(container)
})
