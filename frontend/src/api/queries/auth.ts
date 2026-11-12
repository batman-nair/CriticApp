import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { client, unwrap } from '../client'
import type { LoginRequest, SessionUser } from '../types'

interface Session {
  user: SessionUser | null
}

const all = ['auth'] as const

export const authKeys = {
  all,
  session: () => [...all, 'session'] as const,
}

/** Who is logged in: `{ user }`, with `user` null when nobody is. */
export function useSessionQuery() {
  return useQuery({
    queryKey: authKeys.session(),
    queryFn: async ({ signal }) => {
      const body = await unwrap(client.GET('/api/auth/session', { signal }))
      return body.data
    },
  })
}

/**
 * Sets the `csrftoken` cookie. A plain function for the CSRF middleware, not
 * a query.
 */
export async function fetchCsrfCookie() {
  await unwrap(client.GET('/api/auth/csrf'))
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const body = await unwrap(
        client.POST('/api/auth/login', { body: credentials }),
      )
      return body.data
    },
    onSuccess: ({ user }) => {
      queryClient.setQueryData<Session>(authKeys.session(), { user })
      // Data that depends on who is logged in refetches. The session is
      // already right. Not awaited, so the login doesn't wait for the refetch.
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== all[0],
      })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(client.POST('/api/auth/logout')),
    onSuccess: () => {
      queryClient.setQueryData<Session>(authKeys.session(), { user: null })
      // The session too, so it's confirmed with the server.
      void queryClient.invalidateQueries()
    },
  })
}
