import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { afterEach, expect, it, vi } from 'vitest'
import type { FieldError } from '../../api/types'
import { makeProblem, makeReview, makeSearchResult } from '../../test/fixtures'
import { CREATED_REVIEW_ID, http } from '../../test/handlers'
import { queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { initialAddFlow, type AddFlow } from './useAddFlow'
import { useSaveReview } from './useSaveReview'

const item = makeSearchResult()

function flowWith(overrides: Partial<AddFlow> = {}): AddFlow {
  return {
    ...initialAddFlow('game'),
    step: 'write',
    item,
    rating: 7.5,
    tags: ['cozy'],
    text: 'Huge.',
    ...overrides,
  }
}

function setup(reviewId: number | null = null) {
  const dispatch = vi.fn()
  const view = renderHook(() => useSaveReview(reviewId, dispatch), {
    wrapper: queryWrapper(),
  })
  return { ...view, dispatch }
}

afterEach(() => server.events.removeAllListeners())

interface Sent {
  method: string
  path: string
  body: unknown
}

/** Records each write's method, path and body; await the result to read them. */
function record() {
  const sent: Promise<Sent>[] = []
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'GET') return
    sent.push(
      request
        .clone()
        .json()
        .then((body) => ({
          method: request.method,
          path: new URL(request.url).pathname,
          body,
        })),
    )
  })
  return () => Promise.all(sent)
}

function problem(status: number, code: string, extra = {}) {
  return HttpResponse.json(
    makeProblem({ title: 'Error', status, code, detail: 'Failed.', ...extra }),
    { status },
  )
}

function refusePost(errors: FieldError[]) {
  server.use(
    http.post('/api/v3/reviews', ({ response }) =>
      response.untyped(problem(400, 'VALIDATION_ERROR', { errors })),
    ),
  )
}

it('creates a new review and reports it saved', async () => {
  const sent = record()
  const { result, dispatch } = setup()

  await act(() => result.current.save(flowWith()))

  expect(await sent()).toEqual([
    {
      method: 'POST',
      path: '/api/v3/reviews',
      body: { item_id: item.id, rating: 7.5, text: 'Huge.', tags: ['cozy'] },
    },
  ])
  expect(dispatch).toHaveBeenCalledWith({
    type: 'saved',
    review: expect.objectContaining({ id: CREATED_REVIEW_ID, rating: 7.5 }),
  })
})

it('switches to update on a 409, without saving', async () => {
  server.use(
    http.post('/api/v3/reviews', ({ response }) =>
      response.untyped(
        problem(409, 'DUPLICATE_REVIEW', { existing_review_id: 7 }),
      ),
    ),
  )
  const { result, dispatch } = setup()

  await act(() => result.current.save(flowWith()))

  expect(dispatch.mock.calls).toEqual([[{ type: 'duplicateFound', id: 7 }]])
})

it('updates a pre-filled review with every field, cleared ones included', async () => {
  const sent = record()
  const { result, dispatch } = setup(1)

  await act(() =>
    result.current.save(
      flowWith({
        mode: 'update',
        reviewId: 1,
        prefill: 'done',
        text: '',
        tags: [],
      }),
    ),
  )

  expect(await sent()).toEqual([
    {
      method: 'PATCH',
      path: '/api/v3/reviews/1',
      body: { rating: 7.5, text: '', tags: [] },
    },
  ])
  expect(dispatch).toHaveBeenCalledWith({
    type: 'saved',
    review: expect.objectContaining({ id: 1, rating: 7.5 }),
  })
})

it('after a 409, leaves out empty text and tags', async () => {
  const sent = record()
  const { result } = setup(1)
  const duplicate = { mode: 'update' as const, reviewId: 1, duplicate: true }

  await act(() =>
    result.current.save(flowWith({ ...duplicate, text: '  ', tags: [] })),
  )
  await act(() => result.current.save(flowWith(duplicate)))

  expect((await sent()).map((request) => request.body)).toEqual([
    { rating: 7.5 },
    { rating: 7.5, text: 'Huge.', tags: ['cozy'] },
  ])
})

it('puts the server’s messages under their fields, tags.0 under tags', async () => {
  refusePost([
    { field: 'rating', code: 'max_value', message: 'At most 10.' },
    { field: 'text', code: 'max_length', message: 'Too long.' },
    { field: 'tags.0', code: 'invalid', message: 'Letters only.' },
  ])
  const { result, dispatch } = setup()

  await act(() => result.current.save(flowWith()))

  expect(dispatch).toHaveBeenCalledWith({
    type: 'saveFailed',
    errors: {
      rating: 'At most 10.',
      text: 'Too long.',
      tags: 'Letters only.',
    },
    formError: null,
  })
})

it('shows a message on item_id, or on no field, for the whole form', async () => {
  refusePost([
    { field: 'item_id', code: 'invalid', message: 'Unknown item.' },
    { field: null, code: 'invalid', message: 'Nothing to save.' },
  ])
  const { result, dispatch } = setup()

  await act(() => result.current.save(flowWith()))

  expect(dispatch).toHaveBeenCalledWith({
    type: 'saveFailed',
    errors: {},
    formError: 'Unknown item.',
  })
})

it('shows the problem’s detail, or a generic message, when the save fails', async () => {
  server.use(
    http.post('/api/v3/reviews', ({ response }) =>
      response.untyped(
        problem(502, 'UPSTREAM_ERROR', { detail: 'IGDB isn’t answering.' }),
      ),
    ),
  )
  const { result, dispatch } = setup()

  await act(() => result.current.save(flowWith()))
  expect(dispatch).toHaveBeenLastCalledWith({
    type: 'saveFailed',
    errors: {},
    formError: 'IGDB isn’t answering.',
  })

  server.use(
    http.post('/api/v3/reviews', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 500 })),
    ),
  )
  await act(() => result.current.save(flowWith()))
  expect(dispatch).toHaveBeenLastCalledWith({
    type: 'saveFailed',
    errors: {},
    formError: 'Couldn’t save. Try again.',
  })
})

it('a 409 on an update is a form error, not another switch', async () => {
  server.use(
    http.patch('/api/v3/reviews/{id}', ({ response }) =>
      response.untyped(
        problem(409, 'DUPLICATE_REVIEW', { existing_review_id: 7 }),
      ),
    ),
  )
  const { result, dispatch } = setup(1)

  await act(() =>
    result.current.save(flowWith({ mode: 'update', reviewId: 1 })),
  )

  expect(dispatch).toHaveBeenCalledWith({
    type: 'saveFailed',
    errors: {},
    formError: 'Failed.',
  })
})

it('a 404 on an update reports the review gone', async () => {
  server.use(
    http.patch('/api/v3/reviews/{id}', ({ response }) =>
      response.untyped(problem(404, 'NOT_FOUND')),
    ),
  )
  const { result, dispatch } = setup(1)

  await act(() =>
    result.current.save(flowWith({ mode: 'update', reviewId: 1 })),
  )

  expect(dispatch).toHaveBeenCalledWith({ type: 'reviewGone' })
  expect(dispatch).toHaveBeenCalledTimes(1)
})

it('is saving while the request is out, and ignores a second save', async () => {
  let release!: () => void
  const gate = new Promise<void>((done) => (release = done))
  let requests = 0
  server.use(
    http.post('/api/v3/reviews', async ({ response }) => {
      requests += 1
      await gate
      return response(201).json({ data: makeReview(), meta: {} })
    }),
  )
  const { result, dispatch } = setup()

  let saving!: Promise<void>
  act(() => {
    saving = result.current.save(flowWith())
  })
  await waitFor(() => expect(result.current.isSaving).toBe(true))
  await act(() => result.current.save(flowWith()))

  release()
  await act(() => saving)
  await waitFor(() => expect(result.current.isSaving).toBe(false))
  expect(requests).toBe(1)
  expect(dispatch).toHaveBeenCalledTimes(1)
})
