import { useReducer } from 'react'
import type { Review, SearchCategory, SearchResult } from '../../api/types'

export type AddStep = 'find' | 'rate' | 'write' | 'done'

/** Where a new review's rating starts. */
export const DEFAULT_RATING = 5

/** The fields the server can reject. */
export type AddFlowField = 'rating' | 'tags' | 'text'

export type AddFlowErrors = Partial<Record<AddFlowField, string>>

/** The add sheet's state. Not in the URL: a reload starts over. */
export interface AddFlow {
  step: AddStep
  category: SearchCategory
  /** What's in the search box, as typed. */
  query: string
  /** The picked result, from the Rate step on. */
  item: SearchResult | null
  rating: number
  tags: string[]
  text: string
  /** Update when the picked item is already reviewed. */
  mode: 'create' | 'update'
  /** The existing review, in update mode. */
  reviewId: number | null
  /** Filling the fields from an already-reviewed pick's review. */
  prefill: 'none' | 'loading' | 'done'
  /** Update mode came from a 409 on save, not from the pick. */
  duplicate: boolean
  /** The review as saved, on the done step. */
  saved: Review | null
  /** The server's messages, by field. */
  errors: AddFlowErrors
  /** A message for the whole save, when the server's isn't about a field. */
  formError: string | null
}

export type AddFlowAction =
  | { type: 'categoryChanged'; category: SearchCategory }
  | { type: 'queryChanged'; query: string }
  | { type: 'itemSelected'; item: SearchResult }
  | { type: 'reviewLoaded'; review: Review }
  | { type: 'reviewMissing' }
  | { type: 'ratingChanged'; rating: number }
  | { type: 'tagsChanged'; tags: string[] }
  | { type: 'textChanged'; text: string }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'change' }
  | { type: 'duplicateFound'; id: number }
  | { type: 'saveFailed'; errors: AddFlowErrors; formError: string | null }
  | { type: 'saved'; review: Review }
  | { type: 'addAnother' }

export function initialAddFlow(category: SearchCategory): AddFlow {
  return {
    step: 'find',
    category,
    query: '',
    item: null,
    rating: DEFAULT_RATING,
    tags: [],
    text: '',
    mode: 'create',
    reviewId: null,
    prefill: 'none',
    duplicate: false,
    saved: null,
    errors: {},
    formError: null,
  }
}

function withoutError(errors: AddFlowErrors, field: AddFlowField) {
  if (!(field in errors)) return errors
  const next = { ...errors }
  delete next[field]
  return next
}

/** The step that shows the first field with a message, else `step`. */
function stepForErrors(errors: AddFlowErrors, step: AddStep): AddStep {
  if (errors.rating || errors.tags) return 'rate'
  if (errors.text) return 'write'
  return step
}

function selectItem(state: AddFlow, item: SearchResult): AddFlow {
  // Change, then the same title again: what was entered stays.
  if (state.item?.id === item.id) {
    return { ...state, item, step: 'rate', formError: null }
  }
  const fresh = {
    ...state,
    item,
    step: 'rate' as const,
    tags: [],
    text: '',
    duplicate: false,
    saved: null,
    errors: {},
    formError: null,
  }
  if (item.my_review) {
    return {
      ...fresh,
      rating: item.my_review.rating,
      mode: 'update',
      reviewId: item.my_review.id,
      prefill: 'loading',
    }
  }
  return {
    ...fresh,
    rating: DEFAULT_RATING,
    mode: 'create',
    reviewId: null,
    prefill: 'none',
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
      return selectItem(state, action.item)
    // Once only, so a refetch never overwrites what was changed since.
    case 'reviewLoaded':
      if (state.prefill !== 'loading' || action.review.id !== state.reviewId)
        return state
      return {
        ...state,
        rating: action.review.rating,
        tags: action.review.tags,
        text: action.review.text ?? '',
        prefill: 'done',
      }
    // The review was deleted since the search: it's a new one after all.
    case 'reviewMissing':
      if (state.prefill !== 'loading') return state
      return { ...state, mode: 'create', reviewId: null, prefill: 'none' }
    case 'ratingChanged':
      return {
        ...state,
        rating: action.rating,
        errors: withoutError(state.errors, 'rating'),
      }
    case 'tagsChanged':
      return {
        ...state,
        tags: action.tags,
        errors: withoutError(state.errors, 'tags'),
      }
    case 'textChanged':
      return {
        ...state,
        text: action.text,
        errors: withoutError(state.errors, 'text'),
      }
    case 'next':
      if (state.step !== 'rate') return state
      return { ...state, step: 'write', formError: null }
    // The query and category stay, so Find shows the same results.
    case 'back':
      switch (state.step) {
        case 'rate':
          return { ...state, step: 'find', formError: null }
        case 'write':
          return { ...state, step: 'rate', formError: null }
        default:
          return state
      }
    // Back to Find, keeping what was entered for the picked title.
    case 'change':
      return { ...state, step: 'find', formError: null }
    // What was entered stays, for the owner to confirm as an update.
    case 'duplicateFound':
      return {
        ...state,
        mode: 'update',
        reviewId: action.id,
        duplicate: true,
        formError: null,
      }
    case 'saveFailed':
      return {
        ...state,
        errors: action.errors,
        formError: action.formError,
        step: stepForErrors(action.errors, state.step),
      }
    case 'saved':
      return {
        ...state,
        saved: action.review,
        step: 'done',
        errors: {},
        formError: null,
      }
    case 'addAnother':
      return initialAddFlow(state.category)
  }
}

/** The add sheet's flow, starting on Find in `initialCategory`. */
export function useAddFlow(initialCategory: SearchCategory) {
  return useReducer(addFlowReducer, initialCategory, initialAddFlow)
}
