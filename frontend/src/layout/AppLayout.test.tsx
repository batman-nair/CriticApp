import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { stubSystemTheme } from '../test/matchMedia'
import { queryWrapper } from '../test/render'
import { AppLayout } from './AppLayout'

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

it('puts the outlet in main, between the header and footer', () => {
  stubSystemTheme('light')
  const router = createMemoryRouter([
    {
      element: <AppLayout />,
      children: [{ path: '/', element: <p>Page content</p> }],
    },
  ])
  // The header asks for the session.
  render(<RouterProvider router={router} />, { wrapper: queryWrapper() })

  const main = screen.getByRole('main')
  expect(within(main).getByText('Page content')).toBeInTheDocument()
  expect(
    screen.getByRole('banner').compareDocumentPosition(main) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(
    main.compareDocumentPosition(screen.getByRole('contentinfo')) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})
