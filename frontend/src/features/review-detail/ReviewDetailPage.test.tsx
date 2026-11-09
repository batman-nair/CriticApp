import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, it } from 'vitest'
import { ReviewDetailPage } from './ReviewDetailPage'

it('shows the id from the URL and links back to the list', () => {
  const router = createMemoryRouter(
    [{ path: '/reviews/:id', element: <ReviewDetailPage /> }],
    { initialEntries: ['/reviews/5'] },
  )
  render(<RouterProvider router={router} />)
  expect(screen.getByRole('heading', { name: 'Review 5' })).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Back to the list' }),
  ).toHaveAttribute('href', '/')
})
