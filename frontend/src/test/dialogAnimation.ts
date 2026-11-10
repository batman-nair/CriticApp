import { act } from '@testing-library/react'
import { vi } from 'vitest'

const EXIT_ANIMATION = 'exit'

/**
 * jsdom has no CSS animations, so Radix's Presence unmounts a closing dialog at
 * once. This makes it see an exit animation on the dialog and wait for
 * `finishExitAnimation`. Undo it with `vi.restoreAllMocks()`.
 */
export function stubExitAnimation() {
  const getComputedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = getComputedStyle(element, pseudo)
    if (element.getAttribute('role') !== 'dialog') return style

    // Presence keeps this object and reads it again later, so it has to be live.
    return new Proxy(style, {
      get(target, key) {
        if (key === 'animationName') {
          return element.getAttribute('data-state') === 'closed'
            ? EXIT_ANIMATION
            : 'enter'
        }
        const value: unknown = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  })
}

export function finishExitAnimation(dialog: Element) {
  act(() => {
    dialog.dispatchEvent(
      Object.assign(new Event('animationend'), {
        animationName: EXIT_ANIMATION,
      }),
    )
  })
}

/** Long enough for anything FocusScope has scheduled with setTimeout to run. */
export async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}
