import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { loginPath } from './next'
import { useSession } from './useSession'

/**
 * Shows `children` to the owner only. Logged out goes to the login page,
 * which comes back here; anyone else logged in goes home.
 */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { user, isOwner, isPending } = useSession()
  const location = useLocation()

  if (isPending) return null
  if (isOwner) return children
  if (!user) {
    return (
      <Navigate to={loginPath(location.pathname + location.search)} replace />
    )
  }
  return <Navigate to="/" replace />
}
