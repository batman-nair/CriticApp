import { useLocation, useMatch, type To } from 'react-router'
import { fromParentState } from '../ui/Dialog/useRouteDialog'
import { loginPath } from './next'
import { useSession } from './useSession'

/** Props to spread onto the "Add review" `Link`. */
export interface AddReviewLink {
  to: To
  state?: typeof fromParentState
}

/**
 * Where "Add review" goes: `/add` for the owner, and while the session is
 * pending (the `/add` guard waits for it), the login page when logged out,
 * and `null` (no link) for someone logged in who isn't the owner.
 *
 * `/add` opens over the list as a route dialog, so from the list it keeps the
 * filters in the query and closes back to them. Other pages that share the
 * header, such as the 404 page, don't pass their query on.
 */
export function useAddReviewLink(): AddReviewLink | null {
  const { user, isOwner, isPending } = useSession()
  const location = useLocation()
  const onList = useMatch('/') !== null
  if (isPending || isOwner) {
    return {
      to: { pathname: '/add', search: onList ? location.search : '' },
      state: fromParentState,
    }
  }
  // No state: the login page moves on with `replace`, so closing the dialog
  // falls back to the list.
  if (!user) return { to: loginPath('/add') }
  return null
}
