import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { makeSessionUser } from '../test/fixtures'
import { sessionAs } from '../test/handlers'
import { stubSystemTheme } from '../test/matchMedia'
import { renderRoute } from '../test/renderRoute'
import { server } from '../test/server'

beforeEach(() => {
  stubSystemTheme('light')
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

it('shows /add to the owner', async () => {
  const { router } = renderRoute('/add')

  expect(
    await screen.findByRole('heading', { level: 2, name: 'Add review' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/add')
})

it('shows nothing while the session loads', () => {
  renderRoute('/add')

  expect(
    screen.queryByRole('heading', { level: 2, name: 'Add review' }),
  ).not.toBeInTheDocument()
})

it('sends someone logged out to the login page, coming back to /add', async () => {
  server.use(sessionAs(null))
  const { router } = renderRoute('/add')

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Welcome back' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent(
    'Sign in to see that page.',
  )
  expect(router.state.location.pathname).toBe('/login')
  expect(router.state.location.search).toBe('?next=%2Fadd')
  expect(router.state.historyAction).toBe('REPLACE')
})

it('sends someone else logged in home', async () => {
  server.use(sessionAs(makeSessionUser({ id: 2, username: 'guest' })))
  const { router } = renderRoute('/add')

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(
    screen.queryByRole('heading', { level: 2, name: 'Add review' }),
  ).not.toBeInTheDocument()
})
