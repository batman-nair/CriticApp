import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

/** Link state for a dialog route opened from its parent, so closing goes Back. */
export const fromParentState = { fromParent: true }

function isFromParent(state: unknown) {
  return (state as typeof fromParentState | null)?.fromParent === true
}

/** Props to spread onto a `Dialog` that is its own route. */
export function useRouteDialog() {
  const [open, setOpen] = useState(true)
  const location = useLocation()
  const navigate = useNavigate()

  // Only after the exit: navigating unmounts the dialog at once.
  const onExited = () => {
    if (isFromParent(location.state)) {
      void navigate(-1)
    } else {
      void navigate(
        { pathname: '..', search: location.search },
        { replace: true, preventScrollReset: true },
      )
    }
  }

  return { open, onOpenChange: setOpen, onExited }
}
