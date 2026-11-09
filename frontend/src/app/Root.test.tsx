import { render } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { expect, it } from 'vitest'
import { Root } from './Root'

// The real route table has no titled parent yet, so it can't show this.
it('uses the deepest route title', () => {
  const router = createMemoryRouter([
    {
      element: <Root />,
      children: [
        {
          path: '/',
          element: <Outlet />,
          handle: { title: 'Parent' },
          children: [
            { index: true, element: <p />, handle: { title: 'Child' } },
          ],
        },
      ],
    },
  ])
  render(<RouterProvider router={router} />)
  expect(document.title).toBe('Child · Critic')
})
