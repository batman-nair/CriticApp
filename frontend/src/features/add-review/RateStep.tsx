import { useEffect, useId, useRef } from 'react'
import { useTags } from '../../api/queries/tags'
import type { SearchResult } from '../../api/types'
import { categoryVars } from '../../lib/categories'
import { Button } from '../../ui/Button/Button'
import fieldStyles from '../../ui/field.module.css'
import { RulerPicker } from '../../ui/RulerPicker/RulerPicker'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { TagInput } from '../../ui/TagInput/TagInput'
import { VisuallyHidden } from '../../ui/VisuallyHidden/VisuallyHidden'
import styles from './RateStep.module.css'
import { SaveError } from './SaveError'
import { SelectedItem } from './SelectedItem'
import type { AddFlow, AddFlowErrors } from './useAddFlow'

export const UPDATE_NOTICE =
  'Already in your reviews — your changes will update it.'

interface RateStepProps {
  /** For Next in the sheet's footer, which sits outside the form. */
  id: string
  item: SearchResult
  /** The category's rating name, such as "IMDb". Null while unknown. */
  ratingLabel: string | null
  mode: AddFlow['mode']
  rating: number
  tags: string[]
  prefill: AddFlow['prefill']
  /** The existing review couldn't be loaded, while `prefill` is loading. */
  loadFailed: boolean
  /** Loading the existing review again is under way. */
  reloading: boolean
  errors: AddFlowErrors
  formError: string | null
  /** Saving again is under way. */
  retrying: boolean
  onChangeItem: () => void
  onRatingChange: (rating: number) => void
  onTagsChange: (tags: string[]) => void
  onReload: () => void
  onRetry: () => void
  onSubmit: () => void
}

/**
 * The add sheet's second step, from boards 04 and 21. The RulerPicker is only
 * mounted once the rating is known: one mounted early would read 0, and its
 * first scroll would overwrite the rating.
 */
export function RateStep({
  id,
  item,
  ratingLabel,
  mode,
  rating,
  tags,
  prefill,
  loadFailed,
  reloading,
  errors,
  formError,
  retrying,
  onChangeItem,
  onRatingChange,
  onTagsChange,
  onReload,
  onRetry,
  onSubmit,
}: RateStepProps) {
  const suggestions = useTags().data?.map((tag) => tag.name) ?? []
  const ratingErrorId = useId()
  const loading = prefill === 'loading'

  // Rating starts on the ruler, once it's there.
  const ratingRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (loading) return
    ratingRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus()
  }, [loading])

  let ruler
  if (!loading) {
    ruler = (
      <RulerPicker
        layout="stacked"
        label="Your rating"
        category={item.category}
        value={rating}
        onChange={onRatingChange}
      />
    )
  } else if (loadFailed) {
    ruler = (
      <div className={styles.loadError}>
        <p role="alert">Couldn’t load your review.</p>
        <Button
          variant="secondary"
          size="sm"
          busy={reloading}
          onClick={onReload}
        >
          Try again
        </Button>
      </div>
    )
  } else {
    ruler = (
      <div aria-busy="true">
        <div role="status">
          <VisuallyHidden>Loading your review</VisuallyHidden>
        </div>
        <Skeleton className={styles.rulerSkeleton} radius={12} />
      </div>
    )
  }

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
      <SelectedItem
        item={item}
        ratingLabel={ratingLabel}
        onChange={onChangeItem}
      />
      {mode === 'update' && <p className={styles.notice}>{UPDATE_NOTICE}</p>}
      <div
        ref={ratingRef}
        role="group"
        aria-label="Your rating"
        aria-describedby={errors.rating ? ratingErrorId : undefined}
        className={styles.rating}
        style={categoryVars(item.category)}
      >
        {ruler}
        {errors.rating && (
          <p id={ratingErrorId} className={fieldStyles.error}>
            {errors.rating}
          </p>
        )}
      </div>
      <TagInput
        label="Tags"
        layout="inline"
        optional
        value={tags}
        suggestions={suggestions}
        error={errors.tags}
        disabled={loading}
        onValueChange={onTagsChange}
      />
      {formError && (
        <SaveError message={formError} retrying={retrying} onRetry={onRetry} />
      )}
    </form>
  )
}
