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
  'TextArea',
  'SearchField',
  'TagInput',
  'Poster',
  'RatingBadge',
  'Skeleton',
  'RulerPicker',
  'Dialog',
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

it('has no axe violations', async () => {
  const { container } = renderGallery()
  await expectNoAxeViolations(container)
}, 30_000)
