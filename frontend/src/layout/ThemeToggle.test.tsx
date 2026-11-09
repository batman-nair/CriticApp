import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { stubSystemTheme } from '../test/matchMedia'
import { ThemeToggle } from './ThemeToggle'

const root = document.documentElement

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  delete root.dataset.theme
})

it('flips the theme and its label, and flips back', async () => {
  const user = userEvent.setup()
  stubSystemTheme('light')
  render(<ThemeToggle />)
  expect(root.dataset.theme).toBe('light')

  await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
  expect(root.dataset.theme).toBe('dark')

  await user.click(
    screen.getByRole('button', { name: 'Switch to light theme' }),
  )
  expect(root.dataset.theme).toBe('light')
  expect(
    screen.getByRole('button', { name: 'Switch to dark theme' }),
  ).toBeInTheDocument()
})
