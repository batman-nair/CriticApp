import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { stubSystemTheme } from '../../test/matchMedia'
import { Gallery } from './Gallery'

const SECTIONS = [
  'Button',
  'IconButton',
  'Icon',
  'Chip',
  'Select',
  'TextField',
  'PasswordField',
  'TextArea',
  'SearchField',
  'TagInput',
  'Poster',
  'RatingBadge',
  'Skeleton',
  'RulerPicker',
  'Dialog',
  'Toast',
  'Stepper',
]

const root = document.documentElement

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  delete root.dataset.theme
})

function renderGallery() {
  stubSystemTheme('light')
  return render(<Gallery />)
}

it('has a section per component, in order', () => {
  renderGallery()
  const headings = screen
    .getAllByRole('region')
    .map(
      (section) =>
        within(section).getByRole('heading', { level: 2 }).textContent,
    )
  expect(headings).toEqual(SECTIONS)
})

it('flips the theme from the toggle', async () => {
  const user = userEvent.setup()
  renderGallery()
  expect(root.dataset.theme).toBe('light')
  await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
  expect(root.dataset.theme).toBe('dark')
  await user.click(
    screen.getByRole('button', { name: 'Switch to light theme' }),
  )
  expect(root.dataset.theme).toBe('light')
})

it('opens one toast at a time, with or without Undo', async () => {
  const user = userEvent.setup()
  renderGallery()
  const toast = screen.getByRole('status')

  await user.click(screen.getByRole('button', { name: 'With Undo' }))
  expect(toast).toHaveTextContent('Removed Dune from your watchlist.')
  await user.click(screen.getByRole('button', { name: 'No action' }))
  expect(toast).toHaveTextContent('Couldn’t remove Dune. Try again.')
  expect(within(toast).queryByRole('button')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'With Undo' }))
  await user.click(within(toast).getByRole('button', { name: 'Undo' }))
  expect(toast).toBeEmptyDOMElement()
  expect(screen.getByText(/undone 1×/)).toBeInTheDocument()
})

it('has no axe violations', async () => {
  const { container } = renderGallery()
  await expectNoAxeViolations(container)
}, 30_000)
