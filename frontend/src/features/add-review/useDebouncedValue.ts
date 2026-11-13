import { useEffect, useState } from 'react'

/** How long typing pauses before a search goes out, as on the list. */
export const SEARCH_DEBOUNCE_MS = 300

/** `value`, once it has stayed the same for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
