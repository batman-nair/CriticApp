import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../test/axe'
import { DialogErrorPage } from './DialogErrorPage'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function Crash(): never {
  throw new Error('Dialog crashed')
}

function renderCrash() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            <h1>List</h1>
            <Outlet />
          </>
        ),
        children: [
          {
            path: 'reviews/:id',
            element: <Crash />,
            errorElement: <DialogErrorPage />,
          },
        ],
      },
    ],
    { initialEntries: ['/reviews/1?sort=title'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

it('shows the crash in a dialog over the page', () => {
  renderCrash()

  const dialog = screen.getByRole('dialog', { name: 'Something broke' })
  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    'It’s not you. Give it a moment and try again.',
  )
  expect(
    within(dialog).getByRole('heading', { level: 2, name: 'Something broke' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'List', hidden: true }),
  ).toBeInTheDocument()
  expect(document.title).toBe('Something broke · Critic')
})

it('reloads the page from "Try again"', async () => {
  const reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })
  const user = userEvent.setup()
  renderCrash()

  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(reload).toHaveBeenCalledOnce()
})

it('closes to the page behind from "Back to the list"', async () => {
  const user = userEvent.setup()
  const router = renderCrash()

  await user.click(screen.getByRole('button', { name: 'Back to the list' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('?sort=title')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'List' })).toBeInTheDocument()
})

it('has no axe violations', async () => {
  renderCrash()

  // Not document.body: axe's region rule misfires on portaled content.
  await expectNoAxeViolations(screen.getByRole('dialog'))
})
