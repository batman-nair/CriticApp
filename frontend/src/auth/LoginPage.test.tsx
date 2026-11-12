import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LoginRequest } from '../api/types'
import { expectNoAxeViolations } from '../test/axe'
import { makeProblem, makeSessionUser } from '../test/fixtures'
import { http, sessionAs } from '../test/handlers'
import { stubSystemTheme } from '../test/matchMedia'
import { renderRoute } from '../test/renderRoute'
import { server } from '../test/server'

const NOTICE = 'Sign in to see that page.'
const WRONG = 'That username and password don’t match. Try again.'

beforeEach(() => {
  server.use(sessionAs(null))
  // For the pages a login lands on, which have the theme toggle.
  stubSystemTheme('light')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function failLogin(status: 401 | 429 | 500, code: string) {
  server.use(
    http.post('/api/auth/login', ({ response }) =>
      response(status).json(makeProblem({ status, code, detail: code })),
    ),
  )
}

/** Records the bodies of login requests, answering with the owner. */
function recordLogins() {
  const bodies: LoginRequest[] = []
  server.use(
    http.post('/api/auth/login', async ({ request, response }) => {
      bodies.push(await request.json())
      return response(200).json({ data: { user: makeSessionUser() }, meta: {} })
    }),
  )
  return bodies
}

function usernameField() {
  return screen.getByRole('textbox', { name: 'Username' })
}

function passwordField() {
  return screen.getByLabelText('Password')
}

async function signIn(username: string, password: string) {
  const user = userEvent.setup()
  if (username) await user.type(usernameField(), username)
  if (password) await user.type(passwordField(), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

it('shows the sign-in form in a main landmark, with the logo linking home', () => {
  renderRoute('/login')

  expect(screen.getByRole('main')).toContainElement(
    screen.getByRole('heading', { level: 1, name: 'Welcome back' }),
  )
  expect(screen.getByText('Sign in to add and edit reviews.')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Critic' })).toHaveAttribute(
    'href',
    '/',
  )
  expect(usernameField()).toHaveAttribute('autocomplete', 'username')
  expect(passwordField()).toHaveAttribute('type', 'password')
  expect(passwordField()).toHaveAttribute('autocomplete', 'current-password')
  expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
})

it('shows the wrong-password banner, marks both fields and clears the password', async () => {
  failLogin(401, 'INVALID_CREDENTIALS')
  const { router } = renderRoute('/login')

  await signIn('arjun', 'wrong')

  expect(await screen.findByRole('alert')).toHaveTextContent(WRONG)
  expect(usernameField()).toHaveAttribute('aria-invalid', 'true')
  expect(usernameField()).toHaveValue('arjun')
  expect(passwordField()).toHaveAttribute('aria-invalid', 'true')
  expect(passwordField()).toHaveValue('')
  expect(passwordField()).toHaveFocus()
  // No field message: the banner says it.
  expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
})

it('signs in and goes to `next`', async () => {
  const bodies = recordLogins()
  const { router } = renderRoute('/login?next=%2Fadd')

  await signIn('  devuser ', 'devpass123')

  expect(
    await screen.findByRole('heading', { level: 2, name: 'Add review' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/add')
  // Trimmed username, password as typed.
  expect(bodies).toEqual([{ username: 'devuser', password: 'devpass123' }])
})

it('signs in and goes home without `next`', async () => {
  const { router } = renderRoute('/login')

  await signIn('devuser', 'devpass123')

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('')
})

it('replaces the login page in the history', async () => {
  const { router } = renderRoute('/login?next=%2Fadd')

  await signIn('devuser', 'devpass123')

  await waitFor(() => expect(router.state.location.pathname).toBe('/add'))
  expect(router.state.historyAction).toBe('REPLACE')
})

it('ignores a `next` on another site', async () => {
  const { router } = renderRoute('/login?next=%2F%2Fevil.com')
  expect(screen.queryByText(NOTICE)).not.toBeInTheDocument()

  await signIn('devuser', 'devpass123')

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('')
})

it('says why with a valid `next`', () => {
  renderRoute('/login?next=%2Fadd')

  expect(screen.getByRole('status')).toHaveTextContent(NOTICE)
})

it('has no notice without `next`', () => {
  renderRoute('/login')

  expect(screen.queryByText(NOTICE)).not.toBeInTheDocument()
})

it('hides the notice while the error banner shows', async () => {
  failLogin(401, 'INVALID_CREDENTIALS')
  renderRoute('/login?next=%2Fadd')

  await signIn('arjun', 'wrong')

  expect(await screen.findByRole('alert')).toHaveTextContent(WRONG)
  expect(screen.queryByText(NOTICE)).not.toBeInTheDocument()
})

it('asks for empty fields and sends nothing', async () => {
  const bodies = recordLogins()
  renderRoute('/login')

  const user = await signIn('', '')

  expect(usernameField()).toHaveAccessibleDescription('Enter your username.')
  expect(passwordField()).toHaveAccessibleDescription('Enter your password.')
  expect(usernameField()).toHaveFocus()

  // A username of spaces is empty too.
  await user.type(usernameField(), '   ')
  await user.type(passwordField(), 'devpass123')
  expect(passwordField()).not.toHaveAccessibleDescription()
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(usernameField()).toHaveAccessibleDescription('Enter your username.')
  expect(passwordField()).not.toHaveAccessibleDescription()
  expect(bodies).toEqual([])
})

it('clears the error banner on a submit with an empty field', async () => {
  failLogin(401, 'INVALID_CREDENTIALS')
  renderRoute('/login')

  const user = await signIn('arjun', 'wrong')
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(passwordField()).toHaveAccessibleDescription('Enter your password.')
})

it('says to wait when rate limited', async () => {
  failLogin(429, 'RATE_LIMITED')
  renderRoute('/login')

  await signIn('arjun', 'wrong')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Too many tries. Wait a minute, then try again.',
  )
  // Not the credentials' fault: the password stays.
  expect(passwordField()).toHaveValue('wrong')
  expect(passwordField()).not.toHaveAttribute('aria-invalid')
})

it('says to try again on a server error', async () => {
  failLogin(500, 'SERVER_ERROR')
  renderRoute('/login')

  await signIn('devuser', 'devpass123')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Couldn’t sign in. Try again.',
  )
})

it('says to try again on a network failure', async () => {
  server.use(http.post('/api/auth/login', () => HttpResponse.error()))
  renderRoute('/login')

  await signIn('devuser', 'devpass123')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Couldn’t sign in. Try again.',
  )
})

it('shows progress and hides an earlier error while signing in', async () => {
  failLogin(401, 'INVALID_CREDENTIALS')
  renderRoute('/login')
  const user = await signIn('arjun', 'wrong')
  expect(await screen.findByRole('alert')).toBeInTheDocument()

  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post('/api/auth/login', async ({ response }) => {
      await held
      return response(401).json(
        makeProblem({ status: 401, code: 'INVALID_CREDENTIALS' }),
      )
    }),
  )
  await user.type(passwordField(), 'still-wrong')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  const button = await screen.findByRole('button', { name: 'Signing in…' })
  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()

  release()
  expect(await screen.findByRole('alert')).toHaveTextContent(WRONG)
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
})

it('shows and hides the password', async () => {
  const user = userEvent.setup()
  renderRoute('/login')
  await user.type(passwordField(), 'secret')

  await user.click(screen.getByRole('button', { name: 'Show' }))
  expect(passwordField()).toHaveAttribute('type', 'text')
  expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await user.click(screen.getByRole('button', { name: 'Hide' }))
  expect(passwordField()).toHaveAttribute('type', 'password')
})

it('sends someone already logged in on to `next`', async () => {
  server.use(sessionAs(makeSessionUser()))
  const { router } = renderRoute('/login?next=%2Freviews%2F5')

  await waitFor(() => expect(router.state.location.pathname).toBe('/reviews/5'))
})

it('has no axe violations', async () => {
  const { container } = renderRoute('/login?next=%2Fadd')
  await expectNoAxeViolations(container)
})

it('has no axe violations with errors', async () => {
  failLogin(401, 'INVALID_CREDENTIALS')
  const { container } = renderRoute('/login')
  await signIn('arjun', 'wrong')
  await screen.findByRole('alert')
  await expectNoAxeViolations(container)
}, 30_000)
