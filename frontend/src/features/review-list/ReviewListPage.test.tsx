import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, it } from 'vitest'
import { ReviewListPage } from './ReviewListPage'

it('shows the hero and renders its child route', () => {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <ReviewListPage />,
      children: [{ index: true, element: <p>Child route</p> }],
    },
  ])
  render(<RouterProvider router={router} />)
  expect(
    screen.getByRole('heading', {
      level: 1,
      name: 'Everything I’ve watched, played and read.',
    }),
  ).toBeInTheDocument()
  expect(screen.getByText('Child route')).toBeInTheDocument()
})
