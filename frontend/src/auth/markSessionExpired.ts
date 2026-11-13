import type { QueryClient } from '@tanstack/react-query'
import { authKeys } from '../api/queries/auth'

/**
 * Marks the session logged out after a 401 `UNAUTHENTICATED`, and refetches
 * it to be sure. The owner guard then sends the user to the login page,
 * which, seeing no session, stays there instead of bouncing back to `next`.
 */
export function markSessionExpired(queryClient: QueryClient) {
  queryClient.setQueryData(authKeys.session(), { user: null })
  void queryClient.invalidateQueries({ queryKey: authKeys.session() })
}
