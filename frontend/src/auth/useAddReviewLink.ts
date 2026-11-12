import { loginPath } from './next'
import { useSession } from './useSession'

/**
 * Where "Add review" goes: `/add` for the owner, and while the session is
 * pending (the `/add` guard waits for it), the login page when logged out,
 * and `null` (no link) for someone logged in who isn't the owner.
 */
export function useAddReviewLink(): string | null {
  const { user, isOwner, isPending } = useSession()
  if (isPending || isOwner) return '/add'
  if (!user) return loginPath('/add')
  return null
}
