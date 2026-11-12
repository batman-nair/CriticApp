import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import type { SessionUser } from '../api/types'
import { makeSessionUser } from '../test/fixtures'
import { http, sessionAs } from '../test/handlers'
import { queryWrapper } from '../test/render'
import { server } from '../test/server'
import { useSession } from './useSession'

function renderUseSession() {
  return renderHook(() => useSession(), { wrapper: queryWrapper() })
}

async function settledSession(user: SessionUser | null) {
  server.use(sessionAs(user))
  const { result } = renderUseSession()
  await waitFor(() => expect(result.current.isPending).toBe(false))
  return result.current
}

it('is pending, logged out and not the owner until the session arrives', async () => {
  const { result } = renderUseSession()

  expect(result.current).toEqual({
    user: null,
    isOwner: false,
    isPending: true,
  })
  await waitFor(() => expect(result.current.isPending).toBe(false))
})

it('knows the owner', async () => {
  expect(await settledSession(makeSessionUser())).toEqual({
    user: makeSessionUser(),
    isOwner: true,
    isPending: false,
  })
})

it('has another user logged in but not as the owner', async () => {
  const user = makeSessionUser({ id: 2, username: 'someone-else' })

  expect(await settledSession(user)).toEqual({
    user,
    isOwner: false,
    isPending: false,
  })
})

it('is logged out with a null user', async () => {
  expect(await settledSession(null)).toEqual({
    user: null,
    isOwner: false,
    isPending: false,
  })
})

it('counts a failed session request as logged out', async () => {
  server.use(
    http.get('/api/auth/session', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 500 })),
    ),
  )
  const { result } = renderUseSession()

  await waitFor(() => expect(result.current.isPending).toBe(false))
  expect(result.current).toEqual({
    user: null,
    isOwner: false,
    isPending: false,
  })
})
