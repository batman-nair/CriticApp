import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { authKeys } from '../api/queries/auth'
import { loginPath } from './next'

/**
 * Sends the user to the login page, coming back here, when a write fails
 * because the session has expired. Renders nothing.
 */
export function ExpiredSessionRedirect() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  // An effect event, so the subscription isn't recreated on every navigation.
  const toLogin = useEffectEvent(() => {
    void navigate(loginPath(location.pathname + location.search))
  })

  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return
        const { error } = event.action
        // Login's wrong-password 401 is INVALID_CREDENTIALS, not this.
        if (
          !(error instanceof ApiError) ||
          error.status !== 401 ||
          error.code !== 'UNAUTHENTICATED'
        ) {
          return
        }
        // Logged out before navigating: the login page sends anyone with a
        // session straight back to `next`.
        queryClient.setQueryData(authKeys.session(), { user: null })
        void queryClient.invalidateQueries({ queryKey: authKeys.session() })
        toLogin()
      }),
    [queryClient],
  )

  return null
}
