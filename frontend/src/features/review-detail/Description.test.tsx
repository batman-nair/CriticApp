import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { Description } from './Description'
import styles from './Description.module.css'

const long = 'A bounty hunter crew drifts through the solar system. '.repeat(4)

it('shows a short text whole, with no button', () => {
  render(<Description text={'x'.repeat(160)} />)

  expect(screen.getByText('x'.repeat(160))).not.toHaveClass(styles.clamped!)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('clamps a long text behind More, and opens it', async () => {
  const user = userEvent.setup()
  render(<Description text={long.trim()} />)
  const text = screen.getByText(long.trim())
  const more = screen.getByRole('button', { name: 'More' })

  expect(text).toHaveClass(styles.clamped!)
  expect(more).toHaveAttribute('aria-expanded', 'false')
  expect(more).toHaveAttribute('aria-controls', text.id)

  await user.click(more)

  expect(text).not.toHaveClass(styles.clamped!)
  expect(screen.getByRole('button', { name: 'Less' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
})

it('closes it again with Less', async () => {
  const user = userEvent.setup()
  render(<Description text={long.trim()} />)

  await user.click(screen.getByRole('button', { name: 'More' }))
  await user.click(screen.getByRole('button', { name: 'Less' }))

  expect(screen.getByText(long.trim())).toHaveClass(styles.clamped!)
  expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})

it('has no axe violations', async () => {
  const { container } = render(<Description text={long.trim()} />)

  await expectNoAxeViolations(container)
})
