import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, it } from 'vitest'
import { authKeys } from '../../api/queries/auth'
import { expectNoAxeViolations } from '../../test/axe'
import { makeSessionUser } from '../../test/fixtures'
import { sessionAs } from '../../test/handlers'
import { createTestQueryClient, queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { fromParentState } from '../../ui/Dialog/useRouteDialog'
import { EmptyShelf } from './EmptyShelf'

const ADD = 'Add your first review'

/**
 * Renders the shelf on the list at `path` and waits for the session to load.
 */
async function renderShelf(path = '/') {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      { path: '/', element: <EmptyShelf /> },
      { path: '/add', element: <h2>Add review</h2> },
    ],
    { initialEntries: [path] },
  )
  const result = render(<RouterProvider router={router} />, {
    wrapper: queryWrapper(queryClient),
  })
  await waitFor(() =>
    expect(queryClient.getQueryState(authKeys.session())?.status).toBe(
      'success',
    ),
  )
  return { router, ...result }
}

it('says the shelf is empty and links the owner to adding a review', async () => {
  await renderShelf()

  expect(
    screen.getByRole('heading', { level: 2, name: 'Your shelf is empty' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: ADD })).toHaveAttribute(
    'href',
    '/add',
  )
})

it('opens /add over the list, keeping its filters', async () => {
  const user = userEvent.setup()
  const { router } = await renderShelf('/?q=dune')
  const link = screen.getByRole('link', { name: ADD })
  expect(link).toHaveAttribute('href', '/add?q=dune')

  await user.click(link)

  expect(router.state.location.pathname).toBe('/add')
  expect(router.state.location.search).toBe('?q=dune')
  expect(router.state.location.state).toEqual(fromParentState)
})

it('sends someone logged out through the login page', async () => {
  server.use(sessionAs(null))
  await renderShelf('/?q=dune')

  expect(screen.getByRole('link', { name: ADD })).toHaveAttribute(
    'href',
    '/login?next=%2Fadd',
  )
})

it('has no link for someone logged in who isn’t the owner', async () => {
  server.use(sessionAs(makeSessionUser({ id: 2, username: 'guest' })))
  await renderShelf()

  expect(screen.queryByRole('link', { name: ADD })).not.toBeInTheDocument()
  expect(
    screen.getByRole('heading', { level: 2, name: 'Your shelf is empty' }),
  ).toBeInTheDocument()
})

it('has no axe violations', async () => {
  const { container } = await renderShelf()

  await expectNoAxeViolations(container)
})
