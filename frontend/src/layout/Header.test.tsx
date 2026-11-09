import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { stubSystemTheme } from '../test/matchMedia'
import { Header } from './Header'

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

it.each([
  ['Critic', '/'],
  ['Add review', '/add'],
  ['Log in', '/login'],
])('links %s to %s', (name, href) => {
  stubSystemTheme('light')
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
})

it('has the theme toggle', () => {
  stubSystemTheme('light')
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  )
  expect(
    screen.getByRole('button', { name: 'Switch to dark theme' }),
  ).toBeInTheDocument()
})
