import { HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { makeProblem } from '../test/fixtures'
import { http } from '../test/handlers'
import { server } from '../test/server'
import { ApiError, client, unwrap } from './client'

function categoriesRespondWith(response: Response) {
  server.use(
    http.get('/api/v3/categories', ({ response: reply }) =>
      reply.untyped(response),
    ),
  )
}

function getCategories(signal?: AbortSignal) {
  return unwrap(client.GET('/api/v3/categories', { signal }))
}

function problemResponse(problem: ReturnType<typeof makeProblem>) {
  return HttpResponse.json(problem, {
    status: problem.status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

it('resolves to the response data', async () => {
  const body = await getCategories()
  expect(body.data[0]?.label).toBe('Movies')
})

it('maps a problem+json 400 with field errors', async () => {
  categoriesRespondWith(
    problemResponse(
      makeProblem({
        title: 'Bad Request',
        status: 400,
        code: 'VALIDATION_ERROR',
        detail: 'Some fields are invalid.',
        errors: [{ field: 'rating', code: 'invalid', message: 'Too high.' }],
      }),
    ),
  )

  const error = await getCategories().catch((e) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({
    kind: 'problem',
    status: 400,
    code: 'VALIDATION_ERROR',
    detail: 'Some fields are invalid.',
    errors: [{ field: 'rating', code: 'invalid', message: 'Too high.' }],
  })
})

it('maps a problem+json 404 with no field errors', async () => {
  categoriesRespondWith(problemResponse(makeProblem()))

  await expect(getCategories()).rejects.toMatchObject({
    kind: 'problem',
    status: 404,
    code: 'NOT_FOUND',
    detail: 'Not found.',
    errors: [],
  })
})

it('keeps a problem’s extra members on the error', async () => {
  const problem = {
    ...makeProblem({
      title: 'Conflict',
      status: 409,
      code: 'DUPLICATE_REVIEW',
      detail: 'You already reviewed this.',
    }),
    existing_review_id: 7,
  }
  categoriesRespondWith(problemResponse(problem))

  const error = await getCategories().catch((e) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error.problem).toEqual(problem)
})

it('maps a non-JSON 502 to a generic error', async () => {
  categoriesRespondWith(
    new HttpResponse('<html>Bad Gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    }),
  )

  const error = await getCategories().catch((e) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({
    kind: 'http',
    status: 502,
    code: 'HTTP_ERROR',
    errors: [],
    problem: null,
  })
})

it('maps an empty 500 to a generic error', async () => {
  categoriesRespondWith(new HttpResponse(null, { status: 500 }))

  await expect(getCategories()).rejects.toMatchObject({
    kind: 'http',
    status: 500,
  })
})

it('maps JSON that is not a problem to a generic error', async () => {
  categoriesRespondWith(HttpResponse.json({ error: 'nope' }, { status: 500 }))

  await expect(getCategories()).rejects.toMatchObject({
    kind: 'http',
    status: 500,
    code: 'HTTP_ERROR',
  })
})

it.each([
  ['an HTML page', '<html></html>', 'text/html'],
  ['malformed JSON', '{"data":', 'application/json'],
])('maps a 200 with %s to a generic error', async (_, body, contentType) => {
  categoriesRespondWith(
    new HttpResponse(body, {
      status: 200,
      headers: { 'Content-Type': contentType },
    }),
  )

  const error = await getCategories().catch((e) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ kind: 'http', code: 'HTTP_ERROR' })
})

it('maps a network failure', async () => {
  categoriesRespondWith(HttpResponse.error())

  const error = await getCategories().catch((e) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({
    kind: 'network',
    status: 0,
    code: 'NETWORK_ERROR',
    problem: null,
  })
})

it('resolves a 204 to undefined', async () => {
  server.use(
    http.delete('/api/v3/reviews/{id}', ({ response }) =>
      response(204).empty(),
    ),
  )

  await expect(
    unwrap(
      client.DELETE('/api/v3/reviews/{id}', { params: { path: { id: 1 } } }),
    ),
  ).resolves.toBeUndefined()
})

it('does not report a cancelled request as an ApiError', async () => {
  const controller = new AbortController()
  controller.abort()

  const error = await getCategories(controller.signal).catch((e) => e)

  expect(error).not.toBeInstanceOf(ApiError)
  expect(error.name).toBe('AbortError')
})
