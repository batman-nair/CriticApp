import type { Middleware } from 'openapi-fetch'
import { client, toNetworkError } from '../api/client'
import { fetchCsrfCookie } from '../api/queries/auth'

const COOKIE = 'csrftoken'
const HEADER = 'X-CSRFToken'
const WRITES = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/**
 * The CSRF token, read on every write and never cached: logging in rotates
 * it.
 */
export function readCsrfCookie(): string | null {
  for (const pair of document.cookie.split(';')) {
    const [name, ...value] = pair.trim().split('=')
    if (name === COOKIE) return value.join('=') || null
  }
  return null
}

let pending: Promise<void> | null = null

/**
 * Fetches the cookie when there's none, or always with `force`. Concurrent
 * callers share one request.
 */
export function ensureCsrfCookie({ force = false } = {}): Promise<void> {
  if (!force && readCsrfCookie()) return Promise.resolve()
  pending ??= fetchCsrfCookie().finally(() => {
    pending = null
  })
  return pending
}

/** DRF's message for a failed CSRF check. Its code is a generic 403 one. */
async function isCsrfFailure(response: Response) {
  if (response.status !== 403) return false
  try {
    const body: unknown = await response.clone().json()
    const detail = (body as { detail?: unknown } | null)?.detail
    return typeof detail === 'string' && detail.startsWith('CSRF Failed')
  } catch {
    return false
  }
}

function withToken(request: Request) {
  const token = readCsrfCookie()
  if (token) request.headers.set(HEADER, token)
  return request
}

// fetch consumes the request's body, so a copy is kept for the retry.
const unsent = new Map<string, Request>()

export const csrfMiddleware: Middleware = {
  async onRequest({ request, id }) {
    if (!WRITES.has(request.method)) return undefined
    // Without a cookie the write goes out without the header, and the
    // server's 403 reaches the caller.
    await ensureCsrfCookie().catch(() => {})
    withToken(request)
    unsent.set(id, request.clone())
    return request
  },

  async onResponse({ response, id, options }) {
    const original = unsent.get(id)
    unsent.delete(id)
    if (!original || !(await isCsrfFailure(response))) return undefined
    try {
      await ensureCsrfCookie({ force: true })
    } catch {
      return undefined
    }
    // Once only: this response is returned as it is. Called unbound: the
    // browser's fetch throws "Illegal invocation" as a method of `options`.
    const { fetch } = options
    try {
      return await fetch(withToken(original))
    } catch (error) {
      // The client maps errors only around the first fetch.
      throw toNetworkError(error) ?? error
    }
  },

  onError({ id }) {
    unsent.delete(id)
    return undefined
  },
}

let installed = false

/** Adds the CSRF header to the client's writes. Safe to call twice. */
export function installCsrf() {
  if (installed) return
  installed = true
  client.use(csrfMiddleware)
}
