import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { EmptyShelf } from './EmptyShelf'

function renderShelf() {
  const router = createMemoryRouter([{ path: '/', element: <EmptyShelf /> }])
  return render(<RouterProvider router={router} />)
}

it('says the shelf is empty and links to adding a review', () => {
  renderShelf()

  expect(
    screen.getByRole('heading', { level: 2, name: 'Your shelf is empty' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Add your first review' }),
  ).toHaveAttribute('href', '/add')
})

it('has no axe violations', async () => {
  const { container } = renderShelf()

  await expectNoAxeViolations(container)
})
