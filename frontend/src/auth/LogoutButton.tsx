import { useMatch, useNavigate } from 'react-router'
import { useLogout } from '../api/queries/auth'

interface LogoutButtonProps {
  className?: string
}

/**
 * Logs out and leaves the page where it is. On `/add` it goes home first, so
 * the guard doesn't answer a deliberate logout with the login page. A failed
 * logout changes nothing: the session is still there.
 */
export function LogoutButton({ className }: LogoutButtonProps) {
  const logout = useLogout()
  const navigate = useNavigate()
  const onAdd = useMatch('/add') !== null

  async function handleClick() {
    if (logout.isPending) return
    if (onAdd) await navigate('/', { replace: true, preventScrollReset: true })
    logout.mutate()
  }

  return (
    <button type="button" className={className} onClick={handleClick}>
      Log out
    </button>
  )
}
