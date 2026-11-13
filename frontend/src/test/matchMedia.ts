import { vi } from 'vitest'
import type { Theme } from '../layout/useTheme'

/**
 * jsdom has no matchMedia. Undo with vi.unstubAllGlobals().
 * The returned function changes the system theme and fires the change event.
 */
export function stubSystemTheme(initial: Theme = 'light') {
  let theme = initial
  const listeners = new Set<() => void>()

  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === '(prefers-color-scheme: dark)' && theme === 'dark'
    },
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener)
    },
  }))

  return (next: Theme) => {
    theme = next
    listeners.forEach((listener) => listener())
  }
}

/**
 * Matches only the queries in the list, such as a phone width or reduced
 * motion. Undo with vi.unstubAllGlobals().
 */
export function stubMediaQueries(matching: string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.includes(query),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}
