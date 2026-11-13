import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { makeSearchResult } from '../../test/fixtures'
import {
  addFlowReducer,
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
    rating: null,
    tags: [],
    text: '',
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

it('wraps the reducer in a hook', () => {
  const { result } = renderHook(() => useAddFlow('anime'))
  expect(result.current[0]).toEqual(initialAddFlow('anime'))

  act(() => result.current[1]({ type: 'queryChanged', query: 'bebop' }))

  expect(result.current[0].query).toBe('bebop')
})
