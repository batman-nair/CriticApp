import { useEffect, useId, useRef } from 'react'
import { useTags } from '../../api/queries/tags'
import type { Review } from '../../api/types'
import { reviewCategory } from '../../lib/categories'
import fieldStyles from '../../ui/field.module.css'
import { RatingBadge } from '../../ui/RatingBadge/RatingBadge'
import { RulerPicker } from '../../ui/RulerPicker/RulerPicker'
import { TagInput } from '../../ui/TagInput/TagInput'
import { TextArea } from '../../ui/TextArea/TextArea'
import styles from './ReviewEditForm.module.css'
import type { Draft, DraftErrors } from './useReviewEditor'

export const TEXT_MAX_LENGTH = 5000

interface ReviewEditFormProps {
  /** For Save in the dialog's header, which sits outside the form. */
  id: string
  review: Review
  /** As ReviewDetail takes it: undefined leaves the provider's rating out. */
  ratingLabel: string | null | undefined
  draft: Draft
  errors: DraftErrors
  formError: string | null
  onChange: (update: Partial<Draft>) => void
  onSubmit: () => void
}

/**
 * The rating, notes and tags of a review being edited, in place of
 * ReviewDetail's main column (boards 18 and 19). Only mounted while editing:
 * a RulerPicker mounted hidden would read 0 and overwrite the rating.
 */
export function ReviewEditForm({
  id,
  review,
  ratingLabel,
  draft,
  errors,
  formError,
  onChange,
  onSubmit,
}: ReviewEditFormProps) {
  const { item } = review
  const category =
    item.category === 'anime'
      ? reviewCategory(item.category, item.details.media_type)
      : item.category
  const tags = useTags()
  const suggestions = tags.data?.map((tag) => tag.name) ?? []
  const ratingErrorId = useId()

  // Editing starts on the rating.
  const ratingRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ratingRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus()
  }, [])

  return (
    <form
      id={id}
      className={styles.root}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {formError && (
        <p role="alert" className={fieldStyles.error}>
          {formError}
        </p>
      )}
      <div
        ref={ratingRef}
        role="group"
        aria-label="My rating"
        aria-describedby={errors.rating ? ratingErrorId : undefined}
        className={styles.rating}
      >
        <RulerPicker
          layout="stacked"
          label="My rating"
          category={category}
          value={draft.rating}
          onChange={(rating) => onChange({ rating })}
          labelAside={
            ratingLabel !== undefined && (
              <RatingBadge
                variant="provider"
                provider={ratingLabel ?? 'Rating'}
                category={category}
                rating={item.provider_rating}
              />
            )
          }
        />
        {errors.rating && (
          <p id={ratingErrorId} className={fieldStyles.error}>
            {errors.rating}
          </p>
        )}
      </div>
      <TextArea
        label="In a line or two"
        value={draft.text}
        counterMax={TEXT_MAX_LENGTH}
        rows={4}
        error={errors.text}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      <TagInput
        label="Tags"
        layout="inline"
        optional
        value={draft.tags}
        suggestions={suggestions}
        error={errors.tags}
        onValueChange={(tags) => onChange({ tags })}
      />
    </form>
  )
}
