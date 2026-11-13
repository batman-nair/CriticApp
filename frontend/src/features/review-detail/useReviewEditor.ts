import { useState } from 'react'
import { ApiError } from '../../api/client'
import { useUpdateReview } from '../../api/queries/reviews'
import type { Review } from '../../api/types'
import { normaliseTags } from '../../ui/TagInput/tags'

/** What the edit form changes. */
export interface Draft {
  rating: number
  text: string
  tags: string[]
}

export type DraftField = keyof Draft

export type DraftErrors = Partial<Record<DraftField, string>>

export interface ReviewEditor {
  /** Null outside edit mode. */
  draft: Draft | null
  /** The draft differs from the review as it was when editing started. */
  dirty: boolean
  /** The server's messages, by field. */
  errors: DraftErrors
  /** A message for the whole form, when the server's isn't about a field. */
  formError: string | null
  isSaving: boolean
  /** Starts editing `review`, as it is now. */
  start: (review: Review) => void
  /** Changes fields of the draft, clearing their server messages. */
  change: (update: Partial<Draft>) => void
  /** Sends the draft. Resolves true once saved, false when it wasn't. */
  save: () => Promise<boolean>
  /** Leaves edit mode, dropping the draft and the messages. */
  reset: () => void
}

const SAVE_FAILED = 'Couldn’t save. Try again.'

function toDraft(review: Review): Draft {
  return { rating: review.rating, text: review.text ?? '', tags: review.tags }
}

// In tenths, as RulerPicker rounds, so 7.55 and 7.5 are the same rating.
function tenths(rating: number) {
  return Math.round(Number(rating.toFixed(1)) * 10)
}

function tagsKey(tags: string[]) {
  return normaliseTags(tags).join(',')
}

function isDirty(draft: Draft, baseline: Draft) {
  return (
    tenths(draft.rating) !== tenths(baseline.rating) ||
    draft.text !== baseline.text ||
    tagsKey(draft.tags) !== tagsKey(baseline.tags)
  )
}

// The backend names a list's children with dotted paths, such as "tags.0".
function draftField(field: string | null): DraftField | null {
  if (field === 'rating' || field === 'text' || field === 'tags') return field
  if (field?.startsWith('tags.')) return 'tags'
  return null
}

/** The messages for a failed save: by field where it can, else one for the form. */
function saveErrors(error: unknown) {
  const errors: DraftErrors = {}
  let formError: string | null = null
  if (!(error instanceof ApiError)) return { errors, formError: SAVE_FAILED }

  if (error.status === 400 && error.errors.length > 0) {
    for (const { field, message } of error.errors) {
      const key = draftField(field)
      if (key) errors[key] ??= message
      else formError ??= message
    }
  } else {
    formError = error.kind === 'problem' ? error.detail : SAVE_FAILED
  }
  return { errors, formError }
}

/**
 * The edit mode of review `id`: the draft, whether it has changed, and saving
 * it. Starts from the review as it is when editing starts, so a refetch in the
 * background doesn't move what the draft is compared with.
 */
export function useReviewEditor(id: number): ReviewEditor {
  const update = useUpdateReview(id)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [baseline, setBaseline] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  function start(review: Review) {
    const snapshot = toDraft(review)
    setDraft(snapshot)
    setBaseline(snapshot)
    setErrors({})
    setFormError(null)
  }

  function change(changes: Partial<Draft>) {
    setDraft((current) => current && { ...current, ...changes })
    setErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(changes) as DraftField[]) delete next[key]
      return next
    })
  }

  function reset() {
    setDraft(null)
    setBaseline(null)
    setErrors({})
    setFormError(null)
  }

  // Sends even when the form already shows a rule broken: the server stays the
  // source of truth, and its message lands on the same field.
  async function save() {
    if (!draft || update.isPending) return false
    setFormError(null)
    try {
      await update.mutateAsync(draft)
      return true
    } catch (error) {
      const messages = saveErrors(error)
      setErrors(messages.errors)
      setFormError(messages.formError)
      return false
    }
  }

  return {
    draft,
    dirty: draft !== null && baseline !== null && isDirty(draft, baseline),
    errors,
    formError,
    isSaving: update.isPending,
    start,
    change,
    save,
    reset,
  }
}
