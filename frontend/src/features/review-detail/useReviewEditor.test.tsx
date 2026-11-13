import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import type { FieldError, Review } from '../../api/types'
import { makeProblem, makeReview } from '../../test/fixtures'
import { http } from '../../test/handlers'
import { queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { useReviewEditor } from './useReviewEditor'

function setup(review: Review = makeReview()) {
  const view = renderHook(() => useReviewEditor(review.id), {
    wrapper: queryWrapper(),
  })
  act(() => view.result.current.start(review))
  return view
}

/** Answers PATCH with a 400 carrying `errors`, and records the bodies sent. */
function refuse(errors: FieldError[]) {
  const sent: unknown[] = []
  server.use(
    http.patch('/api/v3/reviews/{id}', async ({ request, response }) => {
      sent.push(await request.json())
      return response(400).json(
        makeProblem({
          title: 'Bad Request',
          status: 400,
          code: 'VALIDATION_ERROR',
          detail: 'Invalid input.',
          errors,
        }),
      )
    }),
  )
  return sent
}

it('is out of edit mode until started', () => {
  const { result } = renderHook(() => useReviewEditor(1), {
    wrapper: queryWrapper(),
  })

  expect(result.current.draft).toBeNull()
  expect(result.current.dirty).toBe(false)
})

it('starts from the review, with no notes as empty text', () => {
  const { result } = setup(
    makeReview({ rating: 8, text: null, tags: ['cozy'] }),
  )

  expect(result.current.draft).toEqual({ rating: 8, text: '', tags: ['cozy'] })
  expect(result.current.dirty).toBe(false)
})

it('compares the rating in tenths', () => {
  const { result } = setup(makeReview({ rating: 7.5 }))

  act(() => result.current.change({ rating: 7.55 }))
  expect(result.current.dirty).toBe(false)

  act(() => result.current.change({ rating: 7.6 }))
  expect(result.current.dirty).toBe(true)

  act(() => result.current.change({ rating: 7.5 }))
  expect(result.current.dirty).toBe(false)
})

it('compares the text as typed', () => {
  const { result } = setup(makeReview({ text: null }))

  act(() => result.current.change({ text: ' ' }))
  expect(result.current.dirty).toBe(true)

  act(() => result.current.change({ text: '' }))
  expect(result.current.dirty).toBe(false)
})

it('compares the tags after normalising them', () => {
  const { result } = setup(makeReview({ tags: ['cozy', 'rewatch'] }))

  act(() => result.current.change({ tags: ['cozy', ' rewatch', 'Cozy'] }))
  expect(result.current.dirty).toBe(false)

  act(() => result.current.change({ tags: ['rewatch', 'cozy'] }))
  expect(result.current.dirty).toBe(true)
})

it('saves the whole draft', async () => {
  const sent: unknown[] = []
  server.use(
    http.patch('/api/v3/reviews/{id}', async ({ request, response }) => {
      const body = await request.json()
      sent.push(body)
      return response(200).json({ data: makeReview(body), meta: {} })
    }),
  )
  const { result } = setup(makeReview({ rating: 9.5, text: 'Old.' }))
  act(() => result.current.change({ text: 'New.' }))

  const saved = await act(() => result.current.save())

  expect(saved).toBe(true)
  expect(sent).toEqual([{ rating: 9.5, text: 'New.', tags: [] }])
})

it('puts the server’s messages under their fields, tags.0 under tags', async () => {
  refuse([
    { field: 'rating', code: 'max_value', message: 'At most 10.' },
    { field: 'text', code: 'max_length', message: 'Too long.' },
    { field: 'tags.0', code: 'invalid', message: 'Letters only.' },
  ])
  const { result } = setup()

  const saved = await act(() => result.current.save())

  expect(saved).toBe(false)
  expect(result.current.errors).toEqual({
    rating: 'At most 10.',
    text: 'Too long.',
    tags: 'Letters only.',
  })
  expect(result.current.formError).toBeNull()
  expect(result.current.draft).not.toBeNull()
})

it('shows a message about no field, or an unknown one, for the whole form', async () => {
  refuse([
    { field: null, code: 'invalid', message: 'Nothing to save.' },
    { field: 'item_id', code: 'read_only', message: 'Can’t change.' },
  ])
  const { result } = setup()

  await act(() => result.current.save())

  expect(result.current.errors).toEqual({})
  expect(result.current.formError).toBe('Nothing to save.')
})

it('shows the problem’s detail, or a generic message, when the save fails', async () => {
  server.use(
    http.patch('/api/v3/reviews/{id}', ({ response }) =>
      response(403).json(
        makeProblem({ status: 403, code: 'FORBIDDEN', detail: 'Not yours.' }),
      ),
    ),
  )
  const { result } = setup()

  await act(() => result.current.save())
  expect(result.current.formError).toBe('Not yours.')

  server.use(
    http.patch('/api/v3/reviews/{id}', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 500 })),
    ),
  )
  await act(() => result.current.save())
  expect(result.current.formError).toBe('Couldn’t save. Try again.')
})

it('clears a field’s message once that field changes', async () => {
  refuse([
    { field: 'text', code: 'max_length', message: 'Too long.' },
    { field: 'tags', code: 'max_length', message: 'Too many.' },
  ])
  const { result } = setup()
  await act(() => result.current.save())

  act(() => result.current.change({ text: 'Shorter.' }))

  expect(result.current.errors).toEqual({ tags: 'Too many.' })
})

it('drops the draft and the messages on reset', async () => {
  refuse([{ field: 'text', code: 'max_length', message: 'Too long.' }])
  const { result } = setup()
  act(() => result.current.change({ text: 'Changed.' }))
  await act(() => result.current.save())

  act(() => result.current.reset())

  expect(result.current.draft).toBeNull()
  expect(result.current.dirty).toBe(false)
  expect(result.current.errors).toEqual({})
})

it('is saving while the request is out', async () => {
  let release!: () => void
  const gate = new Promise<void>((done) => (release = done))
  server.use(
    http.patch('/api/v3/reviews/{id}', async ({ response }) => {
      await gate
      return response(200).json({ data: makeReview(), meta: {} })
    }),
  )
  const { result } = setup()

  let saving!: Promise<boolean>
  act(() => {
    saving = result.current.save()
  })
  await waitFor(() => expect(result.current.isSaving).toBe(true))

  release()
  expect(await act(() => saving)).toBe(true)
  await waitFor(() => expect(result.current.isSaving).toBe(false))
})
