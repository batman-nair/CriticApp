import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

// The inline script in index.html reads the same key.
const STORAGE_KEY = 'critic-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const listeners = new Set<() => void>()

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

function currentTheme(): Theme {
  const applied = document.documentElement.dataset.theme
  return isTheme(applied) ? applied : (storedTheme() ?? systemTheme())
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  // A page without the inline script: make the DOM agree with the snapshot.
  document.documentElement.dataset.theme = currentTheme()

  const media = matchMedia(DARK_QUERY)
  const onSystemChange = () => {
    if (!storedTheme()) applyTheme(systemTheme())
  }
  listeners.add(listener)
  media.addEventListener('change', onSystemChange)
  return () => {
    listeners.delete(listener)
    media.removeEventListener('change', onSystemChange)
  }
}

function toggle() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Blocked storage: the switch lasts until a reload or a system change.
  }
  applyTheme(next)
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme)
  return { theme, toggle }
}
