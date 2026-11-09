import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubSystemTheme } from '../test/matchMedia'
import { App } from './App'

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

// Guards the RouterProvider import: only the real App hits that problem, as
// the other tests use the memory router.
it('renders the shell, with working links', () => {
  stubSystemTheme('light')
  render(<App />)
  expect(screen.getByRole('link', { name: 'Add review' })).toHaveAttribute(
    'href',
    '/add',
  )
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
})
