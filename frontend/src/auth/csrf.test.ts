import { HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import { client, unwrap } from '../api/client'
import { csrfMiddleware } from './csrf'
import { makeProblem, makeSessionUser } from '../test/fixtures'
import { CSRF_TOKEN, http } from '../test/handlers'
import { server } from '../test/server'

const CSRF_FAILED = makeProblem({
  title: 'Forbidden',
  status: 403,
  code: 'PERMISSION_DENIED',
  detail: 'CSRF Failed: CSRF token incorrect.',
})

afterEach(() => server.events.removeAllListeners())

function setCookie(token: string) {
  document.cookie = `csrftoken=${token}; path=/`
}

function problemResponse(problem: ReturnType<typeof makeProblem>) {
  return HttpResponse.json(problem, {
    status: problem.status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

/** Records each request as "METHOD /path token". */
function recordRequests() {
  const requests: string[] = []
  server.events.on('request:start', ({ request }) => {
    const { pathname } = new URL(request.url)
    requests.push(
      `${request.method} ${pathname} ${request.headers.get('X-CSRFToken')}`,
    )
  })
  return requests
}

function logout() {
  return unwrap(client.POST('/api/auth/logout'))
}

function login() {
  return unwrap(
    client.POST('/api/auth/login', {
      body: { username: 'owner', password: 'secret' },
    }),
  )
}

/** Login answers with each of `replies` in turn, after the CSRF check. */
function loginRespondsWith(...replies: (() => Response)[]) {
  const bodies: unknown[] = []
  server.use(
    http.post('/api/auth/login', async ({ request, response }) => {
      bodies.push(await request.json())
      const reply = replies.shift()
      if (!reply) throw new Error('Too many login requests')
      return response.untyped(reply())
    }),
  )
  return bodies
}

it('sends the cookie’s token with writes and not with reads', async () => {
  setCookie('abc')
  server.use(
    http.delete('/api/v3/reviews/{id}', ({ response }) =>
      response(204).empty(),
    ),
  )
  const requests = recordRequests()

  await logout()
  await unwrap(
    client.DELETE('/api/v3/reviews/{id}', { params: { path: { id: 5 } } }),
  )
  await unwrap(client.GET('/api/v3/categories'))

  expect(requests).toEqual([
    'POST /api/auth/logout abc',
    'DELETE /api/v3/reviews/5 abc',
    'GET /api/v3/categories null',
  ])
})

it('reads the cookie again on every write', async () => {
  setCookie('first')
  const requests = recordRequests()

  await logout()
  setCookie('rotated')
  await logout()

  expect(requests).toEqual([
    'POST /api/auth/logout first',
    'POST /api/auth/logout rotated',
  ])
})

it('fetches the cookie before the first write', async () => {
  const requests = recordRequests()

  await logout()

  expect(requests).toEqual([
    'GET /api/auth/csrf null',
    `POST /api/auth/logout ${CSRF_TOKEN}`,
  ])
})

it('fetches the cookie once for concurrent writes', async () => {
  const requests = recordRequests()

  await Promise.all([logout(), logout()])

  expect(requests.filter((r) => r.startsWith('GET'))).toHaveLength(1)
  expect(requests.filter((r) => r.startsWith('POST'))).toEqual([
    `POST /api/auth/logout ${CSRF_TOKEN}`,
    `POST /api/auth/logout ${CSRF_TOKEN}`,
  ])
})

it('sends the write without the header when the cookie can’t be fetched', async () => {
  server.use(
    http.get('/api/auth/csrf', ({ response }) =>
      response(500).json(makeProblem({ status: 500, code: 'SERVER_ERROR' })),
    ),
  )
  const requests = recordRequests()

  await logout()

  expect(requests).toEqual([
    'GET /api/auth/csrf null',
    'POST /api/auth/logout null',
  ])
})

it('refetches the token and retries once after a CSRF failure', async () => {
  setCookie('stale')
  const user = makeSessionUser()
  const bodies = loginRespondsWith(
    () => problemResponse(CSRF_FAILED),
    () => HttpResponse.json({ data: { user }, meta: {} }),
  )
  const requests = recordRequests()

  const body = await login()

  expect(body.data.user).toEqual(user)
  expect(requests).toEqual([
    'POST /api/auth/login stale',
    'GET /api/auth/csrf null',
    `POST /api/auth/login ${CSRF_TOKEN}`,
  ])
  expect(bodies).toEqual([
    { username: 'owner', password: 'secret' },
    { username: 'owner', password: 'secret' },
  ])
})

it('retries with fetch called unbound, as the browser requires', async () => {
  setCookie('stale')
  const sent: (string | null)[] = []
  // Like the browser's fetch, which throws when called as a method of
  // another object.
  function browserFetch(this: unknown, request: Request) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation')
    }
    sent.push(request.headers.get('X-CSRFToken'))
    return Promise.resolve(new Response(null, { status: 204 }))
  }
  const params = {
    id: 'unbound',
    options: Object.freeze({ fetch: browserFetch }),
    request: new Request('http://localhost/api/auth/logout', {
      method: 'POST',
    }),
  } as unknown as Parameters<NonNullable<typeof csrfMiddleware.onRequest>>[0]

  await csrfMiddleware.onRequest?.(params)
  const retried = await csrfMiddleware.onResponse?.({
    ...params,
    response: problemResponse(CSRF_FAILED),
  } as unknown as Parameters<NonNullable<typeof csrfMiddleware.onResponse>>[0])

  expect((retried as Response).status).toBe(204)
  expect(sent).toEqual([CSRF_TOKEN])
})

it('returns a second CSRF failure without retrying again', async () => {
  setCookie('stale')
  const bodies = loginRespondsWith(
    () => problemResponse(CSRF_FAILED),
    () => problemResponse(CSRF_FAILED),
  )

  await expect(login()).rejects.toMatchObject({
    status: 403,
    detail: 'CSRF Failed: CSRF token incorrect.',
  })
  expect(bodies).toHaveLength(2)
})

it('maps a network failure on the retry to a NETWORK_ERROR', async () => {
  setCookie('stale')
  loginRespondsWith(
    () => problemResponse(CSRF_FAILED),
    () => HttpResponse.error(),
  )

  await expect(login()).rejects.toMatchObject({
    kind: 'network',
    code: 'NETWORK_ERROR',
  })
})

it('does not retry another 403 and keeps its problem body', async () => {
  setCookie('abc')
  const bodies = loginRespondsWith(() =>
    problemResponse(
      makeProblem({
        title: 'Forbidden',
        status: 403,
        code: 'PERMISSION_DENIED',
        detail: 'You do not have permission to perform this action.',
      }),
    ),
  )

  await expect(login()).rejects.toMatchObject({
    kind: 'problem',
    status: 403,
    code: 'PERMISSION_DENIED',
    detail: 'You do not have permission to perform this action.',
  })
  expect(bodies).toHaveLength(1)
})
