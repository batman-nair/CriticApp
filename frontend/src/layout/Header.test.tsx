import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSessionUser } from '../test/fixtures'
import { CSRF_TOKEN, http, sessionAs } from '../test/handlers'
import { stubSystemTheme } from '../test/matchMedia'
import { queryWrapper } from '../test/render'
import { renderRoute } from '../test/renderRoute'
import { server } from '../test/server'
import { Header } from './Header'

beforeEach(() => {
  stubSystemTheme('light')
})

afterEach(() => {
  vi.unstubAllGlobals()
  server.events.removeAllListeners()
  delete document.documentElement.dataset.theme
})

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
    { wrapper: queryWrapper() },
  )
}

it('links the logo home', () => {
  renderHeader()
  expect(screen.getByRole('link', { name: 'Critic' })).toHaveAttribute(
    'href',
    '/',
  )
})

it('has the theme toggle', () => {
  renderHeader()
  expect(
    screen.getByRole('button', { name: 'Switch to dark theme' }),
  ).toBeInTheDocument()
})

it('links "Add review" to /add and shows neither "Log in" nor "Log out" while the session loads', () => {
  renderHeader()
  expect(screen.getByRole('link', { name: 'Add review' })).toHaveAttribute(
    'href',
    '/add',
  )
  expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Log out' }),
  ).not.toBeInTheDocument()
})

describe('logged out', () => {
  beforeEach(() => {
    server.use(sessionAs(null))
  })

  it('sends "Add review" through the login page and links "Log in"', async () => {
    renderHeader()
    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    )
    expect(screen.getByRole('link', { name: 'Add review' })).toHaveAttribute(
      'href',
      '/login?next=%2Fadd',
    )
    expect(
      screen.queryByRole('button', { name: 'Log out' }),
    ).not.toBeInTheDocument()
  })
})

describe('as the owner', () => {
  it('links "Add review" to /add and shows "Log out"', async () => {
    renderHeader()
    expect(
      await screen.findByRole('button', { name: 'Log out' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add review' })).toHaveAttribute(
      'href',
      '/add',
    )
    expect(
      screen.queryByRole('link', { name: 'Log in' }),
    ).not.toBeInTheDocument()
  })

  it('logs out with the CSRF header and switches to "Log in"', async () => {
    const user = userEvent.setup()
    const logouts: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname === '/api/auth/logout') {
        logouts.push(request.headers.get('X-CSRFToken'))
      }
    })
    renderHeader()
    const button = await screen.findByRole('button', { name: 'Log out' })
    // For the session refetch after the logout.
    server.use(sessionAs(null))

    await user.click(button)

    expect(
      await screen.findByRole('link', { name: 'Log in' }),
    ).toBeInTheDocument()
    expect(logouts).toEqual([CSRF_TOKEN])
    expect(
      screen.queryByRole('button', { name: 'Log out' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add review' })).toHaveAttribute(
      'href',
      '/login?next=%2Fadd',
    )
  })

  it('keeps "Log out" when the logout fails', async () => {
    const user = userEvent.setup()
    let calls = 0
    server.use(
      http.post('/api/auth/logout', ({ response }) => {
        calls += 1
        return response.untyped(new HttpResponse(null, { status: 500 }))
      }),
    )
    renderHeader()

    await user.click(await screen.findByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(calls).toBe(1))
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Log in' }),
    ).not.toBeInTheDocument()
  })

  it('goes home, not to the login page, when logging out at /add', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/add')
    const button = await screen.findByRole('button', { name: 'Log out' })
    server.use(sessionAs(null))

    await user.click(button)

    expect(
      await screen.findByRole('link', { name: 'Log in' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toBe('')
  })
})

describe('as someone else', () => {
  beforeEach(() => {
    server.use(sessionAs(makeSessionUser({ id: 2, username: 'guest' })))
  })

  it('has no "Add review" and shows "Log out"', async () => {
    renderHeader()
    expect(
      await screen.findByRole('button', { name: 'Log out' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Add review' }),
    ).not.toBeInTheDocument()
  })
})
