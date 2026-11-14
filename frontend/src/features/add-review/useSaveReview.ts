import type { Dispatch } from 'react'
import { ApiError } from '../../api/client'
import {
  duplicateReviewId,
  useCreateReview,
  useUpdateReview,
} from '../../api/queries/reviews'
import type { ReviewUpdate } from '../../api/types'
import type {
  AddFlow,
  AddFlowAction,
  AddFlowErrors,
  AddFlowField,
} from './useAddFlow'

const SAVE_FAILED = 'Couldn’t save. Try again.'

// The backend names a list's children with dotted paths, such as "tags.0".
// As review-detail's useReviewEditor: features don't share.
function flowField(field: string | null): AddFlowField | null {
  if (field === 'rating' || field === 'text' || field === 'tags') return field
  if (field?.startsWith('tags.')) return 'tags'
  return null
}

/** The messages for a failed save: by field where it can, else one for the form. */
function saveErrors(error: unknown) {
  const errors: AddFlowErrors = {}
  let formError: string | null = null
  if (!(error instanceof ApiError)) return { errors, formError: SAVE_FAILED }

  if (error.status === 400 && error.errors.length > 0) {
    for (const { field, message } of error.errors) {
      const key = flowField(field)
      if (key) errors[key] ??= message
      else formError ??= message
    }
  } else {
    formError = error.kind === 'problem' ? error.detail : SAVE_FAILED
  }
  return { errors, formError }
}

/**
 * What an update sends. After a 409 the owner never saw the stored notes and
 * tags, so empty ones leave them alone; after a pre-fill, clearing them is
 * deliberate.
 */
function updateBody(flow: AddFlow): ReviewUpdate {
  if (!flow.duplicate) {
    return { rating: flow.rating, text: flow.text, tags: flow.tags }
  }
  return {
    rating: flow.rating,
    ...(flow.text.trim() !== '' && { text: flow.text }),
    ...(flow.tags.length > 0 && { tags: flow.tags }),
  }
}

/**
 * Saves the add sheet's review: a POST for a new one, a PATCH for one the
 * owner already has. The outcome goes to the flow's reducer, which holds the
 * errors; a 409 switches the flow to update for the owner to confirm. A 401
 * is left to ExpiredSessionRedirect.
 */
export function useSaveReview(
  reviewId: number | null,
  dispatch: Dispatch<AddFlowAction>,
) {
  const create = useCreateReview()
  // Id 0 until there's a review to update: mutate is never called then.
  const update = useUpdateReview(reviewId ?? 0)
  const isSaving = create.isPending || update.isPending

  async function save(flow: AddFlow) {
    if (!flow.item || isSaving) return
    try {
      const review =
        flow.mode === 'update' && flow.reviewId !== null
          ? await update.mutateAsync(updateBody(flow))
          : await create.mutateAsync({
              item_id: flow.item.id,
              rating: flow.rating,
              text: flow.text,
              tags: flow.tags,
            })
      dispatch({ type: 'saved', review })
    } catch (error) {
      if (
        flow.mode === 'update' &&
        error instanceof ApiError &&
        error.status === 404
      ) {
        dispatch({ type: 'reviewGone' })
        return
      }
      const id = flow.mode === 'create' ? duplicateReviewId(error) : null
      if (id !== null) {
        dispatch({ type: 'duplicateFound', id })
        return
      }
      dispatch({ type: 'saveFailed', ...saveErrors(error) })
    }
  }

  return { save, isSaving }
}
