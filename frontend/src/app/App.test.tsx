import { screen } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { http } from '../test/handlers'
import { renderWithClient } from '../test/render'
import { server } from '../test/server'
import { App } from './App'

it('renders the app name', async () => {
  renderWithClient(<App />)
  expect(screen.getByRole('heading', { name: 'Critic' })).toBeInTheDocument()
  await screen.findByText('Movies')
})

it('lists the category labels', async () => {
  renderWithClient(<App />)
  expect(await screen.findByText('Movies')).toBeInTheDocument()
  expect(screen.getByText('Games')).toBeInTheDocument()
})

it('says so when the categories fail to load', async () => {
  server.use(
    http.get('/api/v3/categories', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 500 })),
    ),
  )
  renderWithClient(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't load categories.",
  )
})
