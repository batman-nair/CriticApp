import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { ServerErrorPage } from './ServerErrorPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('reloads the page from "Try again"', async () => {
  const reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <ServerErrorPage />
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(reload).toHaveBeenCalledOnce()
})

it('links back home', () => {
  render(
    <MemoryRouter>
      <ServerErrorPage />
    </MemoryRouter>,
  )
  expect(
    screen.getByRole('heading', { name: 'Something broke on our end' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Back to my reviews' }),
  ).toHaveAttribute('href', '/')
})

it('has a main landmark only when standalone', () => {
  const { rerender } = render(
    <MemoryRouter>
      <ServerErrorPage />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('main')).not.toBeInTheDocument()
  rerender(
    <MemoryRouter>
      <ServerErrorPage standalone />
    </MemoryRouter>,
  )
  expect(screen.getByRole('main')).toBeInTheDocument()
})
