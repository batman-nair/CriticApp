import { MutationObserver } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import { delay } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { client, unwrap } from '../api/client'
import { authKeys } from '../api/queries/auth'
import { makeProblem, makeSessionUser } from '../test/fixtures'
import { http } from '../test/handlers'
import { stubSystemTheme } from '../test/matchMedia'
import { renderRoute } from '../test/renderRoute'
import { server } from '../test/server'

beforeEach(() => {
  stubSystemTheme('light')
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

function failDelete(code: string) {
  server.use(
    http.delete('/api/v3/reviews/{id}', ({ response }) =>
      response(401).json(makeProblem({ status: 401, code, detail: code })),
    ),
  )
}

type QueryClient = ReturnType<typeof renderRoute>['queryClient']

async function sessionLoaded(queryClient: QueryClient) {
  await waitFor(() =>
    expect(queryClient.getQueryData(authKeys.session())).toBeDefined(),
  )
}

/** Runs a delete through the app's query client, as a feature would. */
async function deleteReview(queryClient: QueryClient) {
  const observer = new MutationObserver(queryClient, {
    mutationFn: () =>
      unwrap(
        client.DELETE('/api/v3/reviews/{id}', { params: { path: { id: 5 } } }),
      ),
  })
  await observer.mutate().catch(() => {})
}

it('sends a write with an expired session to the login page, coming back here', async () => {
  failDelete('UNAUTHENTICATED')
  const { router, queryClient } = renderRoute('/reviews/5')
  await sessionLoaded(queryClient)
  // The server has forgotten the session. Slow, so the login page renders
  // before the refetch answers.
  server.use(
    http.get('/api/auth/session', async ({ response }) => {
      await delay(100)
      return response(200).json({ data: { user: null }, meta: {} })
    }),
  )

  await deleteReview(queryClient)

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Welcome back' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(router.state.location.search).toBe('?next=%2Freviews%2F5')
  expect(screen.getByRole('status')).toHaveTextContent(
    'Sign in to see that page.',
  )
  // Stays there: no bounce back to `next` once the session refetches.
  await waitFor(() =>
    expect(queryClient.isFetching({ queryKey: ['auth'] })).toBe(0),
  )
  expect(router.state.location.pathname).toBe('/login')
  expect(screen.getByRole('textbox', { name: 'Username' })).toBeInTheDocument()
})

it('ignores a 401 that isn’t an expired session', async () => {
  failDelete('INVALID_CREDENTIALS')
  const { router, queryClient } = renderRoute('/reviews/5')
  await sessionLoaded(queryClient)

  await deleteReview(queryClient)

  expect(router.state.location.pathname).toBe('/reviews/5')
  expect(queryClient.getQueryData(authKeys.session())).toEqual({
    user: makeSessionUser(),
  })
})
