import createClient from 'openapi-fetch'
import type { paths } from './schema'
import type { FieldError, Problem } from './types'

interface ApiErrorInit {
  kind: 'problem' | 'http' | 'network'
  /** 0 when there's no usable HTTP status. */
  status: number
  code: string
  detail: string
  errors?: FieldError[]
  problem?: Record<string, unknown> | null
  cause?: unknown
}

export class ApiError extends Error {
  readonly kind: ApiErrorInit['kind']
  readonly status: number
  readonly code: string
  readonly detail: string
  readonly errors: FieldError[]
  /**
   * The whole Problem body for `kind: 'problem'`, extra members such as a
   * 409's `existing_review_id` included. Null otherwise.
   */
  readonly problem: Record<string, unknown> | null

  constructor({
    kind,
    status,
    code,
    detail,
    errors,
    problem,
    cause,
  }: ApiErrorInit) {
    super(detail, { cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code
    this.detail = detail
    this.errors = errors ?? []
    this.problem = problem ?? null
  }
}

function genericHttpError(status: number, cause?: unknown) {
  return new ApiError({
    kind: 'http',
    status,
    code: 'HTTP_ERROR',
    detail: 'The server returned an unexpected response.',
    cause,
  })
}

function isProblem(body: unknown): body is Problem {
  if (typeof body !== 'object' || body === null) return false
  const { code, detail } = body as Record<string, unknown>
  return typeof code === 'string' && typeof detail === 'string'
}

export const client = createClient<paths>({
  // Not relative: openapi-fetch builds a Request, and Node's (in tests) rejects
  // a relative URL.
  baseUrl: window.location.origin,
  credentials: 'same-origin',
})

/** The ApiError for a failed fetch, or undefined for a cancelled one. */
export function toNetworkError(error: unknown): ApiError | undefined {
  // By name, because the DOMException class differs between realms under jsdom.
  if ((error as Error).name === 'AbortError') return undefined
  return new ApiError({
    kind: 'network',
    status: 0,
    code: 'NETWORK_ERROR',
    detail: 'Could not reach the server.',
    cause: error,
  })
}

// The CSRF header is added by auth/csrf.ts, whose installCsrf() calls
// client.use from main.tsx (and test/setup.ts).
client.use({
  onError({ error }) {
    return toNetworkError(error)
  },
})

/** Resolves to the response data, or throws an ApiError. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<typeof call>
  try {
    result = await call
  } catch (error) {
    // A 2xx whose body isn't valid JSON, such as an HTML fallback page.
    if ((error as Error).name === 'SyntaxError') {
      throw genericHttpError(0, error)
    }
    throw error
  }

  const { data, error, response } = result
  if (response.ok) return data as T
  if (isProblem(error)) {
    throw new ApiError({
      kind: 'problem',
      status: response.status,
      code: error.code,
      detail: error.detail,
      errors: error.errors,
      problem: { ...error },
    })
  }
  throw genericHttpError(response.status)
}
