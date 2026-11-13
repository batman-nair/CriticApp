import { useSyncExternalStore } from 'react'

/**
 * How much of the layout viewport's bottom the visual viewport doesn't show,
 * which on a phone is the on-screen keyboard.
 */
function currentInset() {
  const viewport = window.visualViewport
  // Pinch-zoom shrinks the visual viewport too, and isn't a keyboard.
  if (!viewport || viewport.scale > 1) return 0
  return Math.max(
    0,
    Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
  )
}

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport
  if (!viewport) return () => {}
  viewport.addEventListener('resize', onChange)
  viewport.addEventListener('scroll', onChange)
  return () => {
    viewport.removeEventListener('resize', onChange)
    viewport.removeEventListener('scroll', onChange)
  }
}

const subscribeNone = () => () => {}
const none = () => 0

/**
 * The keyboard's height in px while `enabled`, so a sheet can sit above it.
 * 0 when disabled or without `visualViewport`.
 */
export function useKeyboardInset(enabled: boolean) {
  return useSyncExternalStore(
    enabled ? subscribe : subscribeNone,
    enabled ? currentInset : none,
  )
}
