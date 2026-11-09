import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { LoginPage } from './LoginPage'

it('shows its heading in a main landmark and links home', () => {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
  expect(screen.getByRole('main')).toContainElement(
    screen.getByRole('heading', { level: 1, name: 'Log in' }),
  )
  expect(
    screen.getByRole('link', { name: 'Back to my reviews' }),
  ).toHaveAttribute('href', '/')
})
