import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { makeReview, makeSearchResult } from '../../test/fixtures'
import {
  addFlowReducer,
  DEFAULT_RATING,
  initialAddFlow,
  useAddFlow,
  type AddFlow,
} from './useAddFlow'

const witcher = makeSearchResult()

function searched(): AddFlow {
  return addFlowReducer(initialAddFlow('game'), {
    type: 'queryChanged',
    query: 'witcher',
  })
}

it('starts on Find in the given category with nothing picked', () => {
  expect(initialAddFlow('movie')).toEqual({
    step: 'find',
    category: 'movie',
    query: '',
    item: null,
    rating: 5,
    tags: [],
    text: '',
    mode: 'create',
    reviewId: null,
    prefill: 'none',
    duplicate: false,
    saved: null,
    errors: {},
    formError: null,
  })
})

it('keeps the query when the category changes', () => {
  const state = addFlowReducer(searched(), {
    type: 'categoryChanged',
    category: 'book',
  })

  expect(state).toMatchObject({
    step: 'find',
    category: 'book',
    query: 'witcher',
  })
})

it('stores the picked item and moves to Rate', () => {
  const state = addFlowReducer(searched(), {
    type: 'itemSelected',
    item: witcher,
  })

  expect(state).toMatchObject({ step: 'rate', item: witcher })
})

it('goes back to Find with the query and category kept', () => {
  const picked = addFlowReducer(searched(), {
    type: 'itemSelected',
    item: witcher,
  })
  const state = addFlowReducer(picked, { type: 'back' })

  expect(state).toMatchObject({
    step: 'find',
    category: 'game',
    query: 'witcher',
  })
})

it('goes back from Write to Rate, and nowhere from Find', () => {
  const writing: AddFlow = { ...searched(), step: 'write', item: witcher }

  expect(addFlowReducer(writing, { type: 'back' }).step).toBe('rate')
  const finding = searched()
  expect(addFlowReducer(finding, { type: 'back' })).toBe(finding)
})

const reviewed = makeSearchResult({
  id: 'igdb:7',
  title: 'Hades',
  my_review: { id: 7, rating: 8.5 },
})

function picked(item = witcher): AddFlow {
  return addFlowReducer(searched(), { type: 'itemSelected', item })
}

/** Rating, tags and text entered on Rate and Write, now on Write. */
function entered(item = witcher): AddFlow {
  let state = picked(item)
  state = addFlowReducer(state, { type: 'ratingChanged', rating: 7.5 })
  state = addFlowReducer(state, { type: 'tagsChanged', tags: ['cozy'] })
  state = addFlowReducer(state, { type: 'next' })
  return addFlowReducer(state, { type: 'textChanged', text: 'Lovely.' })
}

it('starts a new review at the default rating, in create mode', () => {
  expect(picked()).toMatchObject({
    rating: DEFAULT_RATING,
    tags: [],
    text: '',
    mode: 'create',
    reviewId: null,
    prefill: 'none',
  })
})

it('moves from Rate to Write with Next, and only from Rate', () => {
  const state = entered()

  expect(state).toMatchObject({
    step: 'write',
    rating: 7.5,
    tags: ['cozy'],
    text: 'Lovely.',
  })
  expect(addFlowReducer(state, { type: 'next' })).toBe(state)
})

it('keeps what was entered going Back from Write', () => {
  const state = addFlowReducer(entered(), { type: 'back' })

  expect(state).toMatchObject({
    step: 'rate',
    rating: 7.5,
    tags: ['cozy'],
    text: 'Lovely.',
  })
})

it('keeps what was entered after Change and the same title again', () => {
  const changed = addFlowReducer(entered(), { type: 'change' })
  expect(changed).toMatchObject({ step: 'find', query: 'witcher' })

  const state = addFlowReducer(changed, { type: 'itemSelected', item: witcher })

  expect(state).toMatchObject({
    step: 'rate',
    rating: 7.5,
    tags: ['cozy'],
    text: 'Lovely.',
    mode: 'create',
  })
})

it('starts over after Change and a different title', () => {
  const failed = addFlowReducer(entered(), {
    type: 'saveFailed',
    errors: { text: 'Too long.' },
    formError: null,
  })
  const changed = addFlowReducer(failed, { type: 'change' })
  const other = makeSearchResult({ id: 'igdb:2', title: 'Celeste' })

  const state = addFlowReducer(changed, { type: 'itemSelected', item: other })

  expect(state).toMatchObject({
    step: 'rate',
    item: other,
    rating: DEFAULT_RATING,
    tags: [],
    text: '',
    errors: {},
  })
})

it('updates the review of an already-reviewed pick, from its rating', () => {
  expect(picked(reviewed)).toMatchObject({
    step: 'rate',
    rating: 8.5,
    mode: 'update',
    reviewId: 7,
    prefill: 'loading',
    duplicate: false,
  })
})

it('goes back to create mode on a new pick after an already-reviewed one', () => {
  const changed = addFlowReducer(picked(reviewed), { type: 'change' })

  const state = addFlowReducer(changed, { type: 'itemSelected', item: witcher })

  expect(state).toMatchObject({
    rating: DEFAULT_RATING,
    mode: 'create',
    reviewId: null,
    prefill: 'none',
  })
})

it('fills the fields from the loaded review once', () => {
  const review = makeReview({
    id: 7,
    rating: 9,
    tags: ['roguelike'],
    text: 'One more run.',
  })
  const loaded = addFlowReducer(picked(reviewed), {
    type: 'reviewLoaded',
    review,
  })
  expect(loaded).toMatchObject({
    rating: 9,
    tags: ['roguelike'],
    text: 'One more run.',
    prefill: 'done',
  })

  const edited = addFlowReducer(loaded, { type: 'ratingChanged', rating: 4 })
  const refetched = addFlowReducer(edited, { type: 'reviewLoaded', review })
  expect(refetched).toBe(edited)
})

it('fills a review without notes with empty text', () => {
  const state = addFlowReducer(picked(reviewed), {
    type: 'reviewLoaded',
    review: makeReview({ id: 7, text: null }),
  })

  expect(state.text).toBe('')
})

it('ignores a loaded review that isn’t the one being updated', () => {
  const state = picked(reviewed)

  expect(
    addFlowReducer(state, {
      type: 'reviewLoaded',
      review: makeReview({ id: 8 }),
    }),
  ).toBe(state)
  const fresh = picked()
  expect(
    addFlowReducer(fresh, { type: 'reviewLoaded', review: makeReview() }),
  ).toBe(fresh)
})

it('switches to create mode, keeping the rating, when the review is gone', () => {
  const state = addFlowReducer(picked(reviewed), { type: 'reviewMissing' })

  expect(state).toMatchObject({
    rating: 8.5,
    mode: 'create',
    reviewId: null,
    prefill: 'none',
  })
  const fresh = picked()
  expect(addFlowReducer(fresh, { type: 'reviewMissing' })).toBe(fresh)
})

it('switches to update mode on a duplicate, keeping entries and the step', () => {
  const state = addFlowReducer(entered(), { type: 'duplicateFound', id: 7 })

  expect(state).toMatchObject({
    step: 'write',
    rating: 7.5,
    tags: ['cozy'],
    text: 'Lovely.',
    mode: 'update',
    reviewId: 7,
    duplicate: true,
    prefill: 'none',
  })
})

it('goes to Rate for a rating or tags message', () => {
  for (const errors of [{ rating: 'At most 10.' }, { tags: 'Letters only.' }]) {
    const state = addFlowReducer(entered(), {
      type: 'saveFailed',
      errors,
      formError: null,
    })
    expect(state).toMatchObject({ step: 'rate', errors })
  }
})

it('stays on Write for a text message or one for the whole form', () => {
  const textError = addFlowReducer(entered(), {
    type: 'saveFailed',
    errors: { text: 'Too long.' },
    formError: null,
  })
  expect(textError).toMatchObject({
    step: 'write',
    errors: { text: 'Too long.' },
  })

  const formError = addFlowReducer(entered(), {
    type: 'saveFailed',
    errors: {},
    formError: 'Couldn’t save. Try again.',
  })
  expect(formError).toMatchObject({
    step: 'write',
    formError: 'Couldn’t save. Try again.',
  })
})

it('clears a field’s message when it changes', () => {
  const failed = addFlowReducer(entered(), {
    type: 'saveFailed',
    errors: { rating: 'At most 10.', tags: 'Bad.', text: 'Too long.' },
    formError: null,
  })

  let state = addFlowReducer(failed, { type: 'ratingChanged', rating: 6 })
  expect(state.errors).toEqual({ tags: 'Bad.', text: 'Too long.' })
  state = addFlowReducer(state, { type: 'tagsChanged', tags: [] })
  expect(state.errors).toEqual({ text: 'Too long.' })
  state = addFlowReducer(state, { type: 'textChanged', text: '' })
  expect(state.errors).toEqual({})
})

it.each([
  ['back', { type: 'back' }],
  ['change', { type: 'change' }],
  ['addAnother', { type: 'addAnother' }],
] as const)('clears the form message on %s', (_, action) => {
  const failed = addFlowReducer(entered(), {
    type: 'saveFailed',
    errors: {},
    formError: 'Failed.',
  })

  expect(addFlowReducer(failed, action).formError).toBeNull()
})

it('clears the form message on Next and on picking a title', () => {
  const failed: AddFlow = { ...picked(), formError: 'Failed.' }

  expect(addFlowReducer(failed, { type: 'next' }).formError).toBeNull()
  expect(
    addFlowReducer(failed, { type: 'itemSelected', item: witcher }).formError,
  ).toBeNull()
})

it('stores the saved review and moves to done', () => {
  const review = makeReview({ id: 3 })

  const state = addFlowReducer(entered(), { type: 'saved', review })

  expect(state).toMatchObject({ step: 'done', saved: review })
})

it('starts again on an empty Find in the same category with Add another', () => {
  const done = addFlowReducer(entered(), {
    type: 'saved',
    review: makeReview(),
  })

  expect(addFlowReducer(done, { type: 'addAnother' })).toEqual(
    initialAddFlow('game'),
  )
})

it('wraps the reducer in a hook', () => {
  const { result } = renderHook(() => useAddFlow('anime'))
  expect(result.current[0]).toEqual(initialAddFlow('anime'))

  act(() => result.current[1]({ type: 'queryChanged', query: 'bebop' }))

  expect(result.current[0].query).toBe('bebop')
})
