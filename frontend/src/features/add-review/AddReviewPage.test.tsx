import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { AddReviewPage } from './AddReviewPage'

it('shows its heading and links back to the list', () => {
  render(
    <MemoryRouter>
      <AddReviewPage />
    </MemoryRouter>,
  )
  expect(
    screen.getByRole('heading', { name: 'Add review' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Back to the list' }),
  ).toHaveAttribute('href', '/')
})
