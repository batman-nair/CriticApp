import { useReducer } from 'react'
import type { SearchCategory, SearchResult } from '../../api/types'

export type AddStep = 'find' | 'rate' | 'write'

/** The add sheet's state. Not in the URL: a reload starts over. */
export interface AddFlow {
  step: AddStep
  category: SearchCategory
  /** What's in the search box, as typed. */
  query: string
  /** The picked result, from the Rate step on. */
  item: SearchResult | null
  rating: number | null
  tags: string[]
  text: string
}

export type AddFlowAction =
  | { type: 'categoryChanged'; category: SearchCategory }
  | { type: 'queryChanged'; query: string }
  | { type: 'itemSelected'; item: SearchResult }
  | { type: 'back' }

export function initialAddFlow(category: SearchCategory): AddFlow {
  return {
    step: 'find',
    category,
    query: '',
    item: null,
    rating: null,
    tags: [],
    text: '',
  }
}

export function addFlowReducer(state: AddFlow, action: AddFlowAction): AddFlow {
  switch (action.type) {
    // The query stays, so the search runs again in the new category.
    case 'categoryChanged':
      return { ...state, category: action.category }
    case 'queryChanged':
      return { ...state, query: action.query }
    case 'itemSelected':
      return { ...state, item: action.item, step: 'rate' }
    // The query and category stay, so Find shows the same results.
    case 'back':
      switch (state.step) {
        case 'rate':
          return { ...state, step: 'find' }
        case 'write':
          return { ...state, step: 'rate' }
        default:
          return state
      }
  }
}

/** The add sheet's flow, starting on Find in `initialCategory`. */
export function useAddFlow(initialCategory: SearchCategory) {
  return useReducer(addFlowReducer, initialCategory, initialAddFlow)
}
