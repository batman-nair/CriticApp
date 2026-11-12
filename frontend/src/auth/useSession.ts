import { useSessionQuery } from '../api/queries/auth'
import type { SessionUser } from '../api/types'
import { OWNER_USERNAME } from '../config'

export interface Session {
  /** Null when logged out, while pending, or when the session can't be read. */
  user: SessionUser | null
  /** The logged-in user is the one whose reviews the site shows. */
  isOwner: boolean
  isPending: boolean
}

/**
 * Who is logged in. A failed session request counts as logged out, so a
 * broken endpoint never shows the owner's controls.
 */
export function useSession(): Session {
  const { data, isPending, isError } = useSessionQuery()
  const user = data?.user ?? null
  return {
    user,
    isOwner: user?.username === OWNER_USERNAME,
    isPending: isPending && !isError,
  }
}
