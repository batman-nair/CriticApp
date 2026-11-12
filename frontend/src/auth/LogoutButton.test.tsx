import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, it } from 'vitest'
import { authKeys } from '../api/queries/auth'
import { makeSessionUser } from '../test/fixtures'
import { http } from '../test/handlers'
import { createTestQueryClient, queryWrapper } from '../test/render'
import { server } from '../test/server'
import { LogoutButton } from './LogoutButton'

afterEach(() => server.events.removeAllListeners())

function renderButton(path = '/') {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(authKeys.session(), { user: makeSessionUser() })
  const router = createMemoryRouter(
    [
      { path: '/', element: <LogoutButton className="custom" /> },
      { path: '/add', element: <LogoutButton /> },
      { path: '/reviews/:id', element: <LogoutButton /> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />, {
    wrapper: queryWrapper(queryClient),
  })
  return { router, queryClient }
}

function countLogouts() {
  const count = { value: 0 }
  server.events.on('request:start', ({ request }) => {
    if (new URL(request.url).pathname === '/api/auth/logout') count.value += 1
  })
  return count
}

function sessionUser(queryClient: ReturnType<typeof createTestQueryClient>) {
  return queryClient.getQueryData<{ user: unknown }>(authKeys.session())?.user
}

it('is a button with the given class', () => {
  renderButton()
  const button = screen.getByRole('button', { name: 'Log out' })
  expect(button).toHaveAttribute('type', 'button')
  expect(button).toHaveClass('custom')
})

it('logs out and stays on the page', async () => {
  const user = userEvent.setup()
  const { router, queryClient } = renderButton('/reviews/5')

  await user.click(screen.getByRole('button', { name: 'Log out' }))

  await waitFor(() => expect(sessionUser(queryClient)).toBeNull())
  expect(router.state.location.pathname).toBe('/reviews/5')
})

it('goes home first at /add', async () => {
  const user = userEvent.setup()
  const { router, queryClient } = renderButton('/add')

  await user.click(screen.getByRole('button', { name: 'Log out' }))

  await waitFor(() => expect(sessionUser(queryClient)).toBeNull())
  expect(router.state.location.pathname).toBe('/')
  expect(router.state.historyAction).toBe('REPLACE')
})

it('ignores clicks while logging out', async () => {
  const user = userEvent.setup()
  const count = countLogouts()
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post('/api/auth/logout', async ({ response }) => {
      await held
      return response(204).empty()
    }),
  )
  const { queryClient } = renderButton()

  const button = screen.getByRole('button', { name: 'Log out' })
  await user.click(button)
  await waitFor(() => expect(count.value).toBe(1))
  await user.click(button)
  release()

  await waitFor(() => expect(sessionUser(queryClient)).toBeNull())
  expect(count.value).toBe(1)
})

it('keeps the session when the logout fails', async () => {
  const user = userEvent.setup()
  const count = countLogouts()
  server.use(
    http.post('/api/auth/logout', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 500 })),
    ),
  )
  const { queryClient } = renderButton()

  await user.click(screen.getByRole('button', { name: 'Log out' }))

  await waitFor(() => expect(count.value).toBe(1))
  await waitFor(() =>
    expect(queryClient.getMutationCache().getAll()[0]?.state.status).toBe(
      'error',
    ),
  )
  expect(sessionUser(queryClient)).toEqual(makeSessionUser())
  expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
})
