import { createSearchParams } from 'react-router'

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/**
 * `raw` when it's a path on this site, otherwise `/`. Keeps a `next` query
 * parameter from sending the user to another site, or back to the login page.
 */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/'
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  if (CONTROL_CHARACTERS.test(raw)) return '/'

  const { origin } = window.location
  let url: URL
  try {
    url = new URL(raw, origin)
  } catch {
    return '/'
  }
  if (url.origin !== origin) return '/'
  if (url.pathname === '/login' || url.pathname.startsWith('/login/')) {
    return '/'
  }
  return url.pathname + url.search + url.hash
}

/** The login page, sending the user on to `next` afterwards. */
export function loginPath(next?: string): string {
  return next ? `/login?${createSearchParams({ next })}` : '/login'
}
