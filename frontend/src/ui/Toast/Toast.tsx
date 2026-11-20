import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import { cx } from '../../lib/cx'
import styles from './Toast.module.css'

export interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastProps {
  open: boolean
  /** The message. */
  children: ReactNode
  action?: ToastAction
  /** Milliseconds until it closes, counted while it isn't hovered or focused. */
  duration?: number
  /** Called when the time is up, and on Escape. */
  onClose: () => void
  /** A new value is a new message: the timer starts again. */
  messageKey?: string | number
  /** So the caller can move focus to the action. */
  actionRef?: Ref<HTMLButtonElement>
  /** Where focus goes when the message goes away with focus inside it. */
  returnFocusRef?: RefObject<HTMLElement | null>
  className?: string
}

/**
 * One short message at the foot of the screen, with an optional action.
 *
 * Render one and keep it mounted: the live region stays in the page while
 * it's closed, so each new message is announced. Don't `key` it either.
 */
export function Toast({
  open,
  children,
  action,
  duration = 6000,
  onClose,
  messageKey,
  actionRef,
  returnFocusRef,
  className,
}: ToastProps) {
  const regionRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // Set by the focus events, read after a message goes away.
  const focusInside = useRef(false)

  // Closed, it's gone from under the pointer and focus without a leave or
  // blur event. A new message starts its full time. Adjusted during render.
  const [shown, setShown] = useState({ open, messageKey })
  if (shown.open !== open || shown.messageKey !== messageKey) {
    setShown({ open, messageKey })
    if (!open) setHovered(false)
    setFocused(false)
  }

  const close = useEffectEvent(onClose)
  const paused = hovered || focused
  useEffect(() => {
    if (!open || paused) return
    const timer = setTimeout(close, duration)
    return () => clearTimeout(timer)
  }, [open, paused, duration, messageKey])

  function returnFocus() {
    const target = returnFocusRef?.current
    if (target?.isConnected) target.focus({ preventScroll: true })
  }

  // The message (or its action) went away with focus in it: where browsers
  // fire no blur for a removed element, focus is on <body> by now.
  useLayoutEffect(() => {
    const region = regionRef.current
    if (!focusInside.current || region?.contains(document.activeElement)) {
      return
    }
    focusInside.current = false
    returnFocus()
    // Only when the content changes. returnFocus reads a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messageKey])

  function handleFocus() {
    focusInside.current = true
    setFocused(true)
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    focusInside.current = false
    setFocused(false)
    // Browsers that blur a removed element: once it's gone, focus would be on
    // <body>. A click elsewhere on the page leaves the element connected.
    const target = event.target
    if (next === null) {
      queueMicrotask(() => {
        const active = document.activeElement
        if (!target.isConnected && (!active || active === document.body)) {
          returnFocus()
        }
      })
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onClose()
  }

  return (
    <div
      ref={regionRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cx(styles.region, className)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {open && (
        <div
          className={styles.toast}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onKeyDown={handleKeyDown}
        >
          <p className={styles.message}>{children}</p>
          {action && (
            <button
              ref={actionRef}
              type="button"
              className={styles.action}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
