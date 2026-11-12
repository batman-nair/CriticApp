import { useEffect, useRef } from 'react'
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
  const leaving = useRef(false)
  const { mutate } = logout

  // Logs out only once `/add` is off the screen. navigate() resolves before
  // React commits the new route, so logging out straight after it lets the
  // guard on `/add` see the logged-out session and go to the login page.
  useEffect(() => {
    if (!leaving.current || onAdd) return
    leaving.current = false
    mutate()
  }, [onAdd, mutate])

  function handleClick() {
    if (logout.isPending || leaving.current) return
    if (onAdd) {
      leaving.current = true
      void navigate('/', { replace: true, preventScrollReset: true })
      return
    }
    mutate()
  }

  return (
    <button type="button" className={className} onClick={handleClick}>
      Log out
    </button>
  )
}
