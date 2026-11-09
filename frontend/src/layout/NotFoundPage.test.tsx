import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, it } from 'vitest'
import { NotFoundPage } from './NotFoundPage'

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Home</p> },
      { path: '*', element: <NotFoundPage /> },
    ],
    { initialEntries: ['/nope'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

function search() {
  return screen.getByRole('searchbox', { name: 'Search your reviews' })
}

it('links back home', () => {
  renderPage()
  expect(
    screen.getByRole('heading', { name: "This page isn't on the shelf" }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Back to my reviews' }),
  ).toHaveAttribute('href', '/')
})

it('searches for the trimmed, encoded value', async () => {
  const user = userEvent.setup()
  const router = renderPage()
  await user.type(search(), '  dune & co {Enter}')
  expect(router.state.location.pathname).toBe('/')
  expect(router.state.location.search).toBe('?q=dune+%26+co')
})

it('goes home without a query when the search is empty', async () => {
  const user = userEvent.setup()
  const router = renderPage()
  await user.type(search(), '   {Enter}')
  expect(router.state.location.pathname).toBe('/')
  expect(router.state.location.search).toBe('')
})
