import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { makeSessionUser } from '../../test/fixtures'
import { http, sessionAs } from '../../test/handlers'
import { createTestQueryClient, queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { authKeys, useLogin, useLogout, useSessionQuery } from './auth'

it('returns the logged-in user', async () => {
  const { result } = renderHook(() => useSessionQuery(), {
    wrapper: queryWrapper(),
  })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual({ user: makeSessionUser() })
})

it('returns a null user when nobody is logged in', async () => {
  server.use(sessionAs(null))
  const { result } = renderHook(() => useSessionQuery(), {
    wrapper: queryWrapper(),
  })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual({ user: null })
})

it('writes the session on login and refetches other queries', async () => {
  const user = makeSessionUser({ id: 7, username: 'someone' })
  const sent: unknown[] = []
  server.use(
    http.post('/api/auth/login', async ({ request, response }) => {
      sent.push(await request.json())
      return response(200).json({ data: { user }, meta: {} })
    }),
  )
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(authKeys.session(), { user: null })
  queryClient.setQueryData(['reviews', 'list'], 'old')
  const { result } = renderHook(() => useLogin(), {
    wrapper: queryWrapper(queryClient),
  })

  await act(() =>
    result.current.mutateAsync({ username: 'someone', password: 'secret' }),
  )

  expect(sent).toEqual([{ username: 'someone', password: 'secret' }])
  expect(queryClient.getQueryData(authKeys.session())).toEqual({ user })
  expect(queryClient.getQueryState(authKeys.session())?.isInvalidated).toBe(
    false,
  )
  expect(queryClient.getQueryState(['reviews', 'list'])?.isInvalidated).toBe(
    true,
  )
})

it('exposes a failed login as an ApiError with the problem code', async () => {
  server.use(
    http.post('/api/auth/login', ({ response }) =>
      response(401).json({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        code: 'INVALID_CREDENTIALS',
        detail: 'Invalid username or password.',
      }),
    ),
  )
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(authKeys.session(), { user: null })
  const { result } = renderHook(() => useLogin(), {
    wrapper: queryWrapper(queryClient),
  })

  act(() => result.current.mutate({ username: 'a', password: 'b' }))

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toMatchObject({
    status: 401,
    code: 'INVALID_CREDENTIALS',
  })
  expect(queryClient.getQueryData(authKeys.session())).toEqual({ user: null })
})

it('sets a null user on logout and refetches everything', async () => {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(authKeys.session(), { user: makeSessionUser() })
  queryClient.setQueryData(['reviews', 'list'], 'old')
  const { result } = renderHook(() => useLogout(), {
    wrapper: queryWrapper(queryClient),
  })

  await act(() => result.current.mutateAsync())

  expect(queryClient.getQueryData(authKeys.session())).toEqual({ user: null })
  expect(queryClient.getQueryState(authKeys.session())?.isInvalidated).toBe(
    true,
  )
  expect(queryClient.getQueryState(['reviews', 'list'])?.isInvalidated).toBe(
    true,
  )
})

it('keeps the login’s session over a session fetch sent before it', async () => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get('/api/auth/session', async ({ response }) => {
      await held
      return response(200).json({ data: { user: null }, meta: {} })
    }),
  )
  const queryClient = createTestQueryClient()
  const session = renderHook(() => useSessionQuery(), {
    wrapper: queryWrapper(queryClient),
  })
  const login = renderHook(() => useLogin(), {
    wrapper: queryWrapper(queryClient),
  })

  await act(() =>
    login.result.current.mutateAsync({ username: 'owner', password: 'secret' }),
  )
  release()

  await waitFor(() => expect(session.result.current.isFetching).toBe(false))
  expect(queryClient.getQueryData(authKeys.session())).toEqual({
    user: makeSessionUser(),
  })
})
