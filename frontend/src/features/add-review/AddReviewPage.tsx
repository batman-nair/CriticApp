import { useEffect, useId, useState } from 'react'
import { ApiError } from '../../api/client'
import { useCategories } from '../../api/queries/categories'
import { useReview } from '../../api/queries/reviews'
import { Button } from '../../ui/Button/Button'
import { Dialog } from '../../ui/Dialog/Dialog'
import { useRouteDialog } from '../../ui/Dialog/useRouteDialog'
import { Stepper } from '../../ui/Stepper/Stepper'
import styles from './AddReviewPage.module.css'
import { FindStep } from './FindStep'
import { readLastCategory } from './lastCategory'
import { RateStep } from './RateStep'
import { SavedReview } from './SavedReview'
import { useAddFlow, type AddStep } from './useAddFlow'
import { useSaveReview } from './useSaveReview'
import { WriteStep } from './WriteStep'

const STEPS = ['Find', 'Rate', 'Write']

const STEP_INDEX: Record<AddStep, number> = {
  find: 0,
  rate: 1,
  write: 2,
  done: 3,
}

export function AddReviewPage() {
  const dialog = useRouteDialog()
  const [initialCategory] = useState(() => readLastCategory() ?? 'movie')
  const [flow, dispatch] = useAddFlow(initialCategory)
  const categories = useCategories()
  const { save, isSaving } = useSaveReview(flow.reviewId, dispatch)
  const rateId = useId()
  const writeId = useId()

  // An already-reviewed pick fills the fields from its review. Id 0 (create
  // mode) never asks. The list's copy shown as placeholder may be older, so
  // only the fetched review counts; the reducer takes the first one only.
  const existing = useReview(flow.reviewId ?? 0)
  const { data: existingReview, isPlaceholderData, error } = existing
  useEffect(() => {
    if (existingReview && !isPlaceholderData) {
      dispatch({ type: 'reviewLoaded', review: existingReview })
    }
  }, [existingReview, isPlaceholderData, dispatch])
  // Deleted since the search: it's a new review after all.
  const missing = error instanceof ApiError && error.status === 404
  useEffect(() => {
    if (missing) dispatch({ type: 'reviewMissing' })
  }, [missing, dispatch])

  const { item } = flow
  const update = flow.mode === 'update'
  const ratingLabel = item
    ? (categories.data?.find((c) => c.id === item.category)?.rating_label ??
      null)
    : null

  let title
  let body
  let footer
  if (flow.step === 'done' && flow.saved) {
    title = update ? 'Review updated' : 'Added to your reviews'
    body = <SavedReview review={flow.saved} ratingLabel={ratingLabel} />
    footer = (
      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: 'addAnother' })}
        >
          Add another
        </Button>
        <Button onClick={() => dialog.onOpenChange(false)}>Done</Button>
      </div>
    )
  } else if (flow.step === 'write' && item) {
    title = update ? 'Update your words' : 'Say a few words'
    body = (
      <WriteStep
        id={writeId}
        item={item}
        ratingLabel={ratingLabel}
        rating={flow.rating}
        text={flow.text}
        error={flow.errors.text}
        formError={flow.formError}
        retrying={isSaving}
        onChangeItem={() => dispatch({ type: 'change' })}
        onTextChange={(text) => dispatch({ type: 'textChanged', text })}
        onRetry={() => void save(flow)}
        onSubmit={() => void save(flow)}
      />
    )
    footer = (
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => dispatch({ type: 'back' })}>
          Back
        </Button>
        <Button type="submit" form={writeId} busy={isSaving}>
          {update ? 'Update review' : 'Add review'}
        </Button>
      </div>
    )
  } else if (flow.step === 'rate' && item) {
    const loading = flow.prefill === 'loading'
    title = update ? 'Update your rating' : 'Rate it'
    body = (
      <RateStep
        id={rateId}
        item={item}
        ratingLabel={ratingLabel}
        mode={flow.mode}
        rating={flow.rating}
        tags={flow.tags}
        prefill={flow.prefill}
        loadFailed={loading && existing.isError && !missing}
        reloading={existing.isFetching}
        errors={flow.errors}
        formError={flow.formError}
        retrying={isSaving}
        onChangeItem={() => dispatch({ type: 'change' })}
        onRatingChange={(rating) => dispatch({ type: 'ratingChanged', rating })}
        onTagsChange={(tags) => dispatch({ type: 'tagsChanged', tags })}
        onReload={() => void existing.refetch()}
        onRetry={() => void save(flow)}
        // Not before the review's fields are in, or they'd land on Write.
        onSubmit={() => {
          if (!loading) dispatch({ type: 'next' })
        }}
      />
    )
    footer = (
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => dispatch({ type: 'back' })}>
          Back
        </Button>
        <Button
          type="submit"
          form={rateId}
          aria-disabled={loading || undefined}
        >
          Next
        </Button>
      </div>
    )
  } else {
    title = 'What are you adding?'
    body = (
      <FindStep
        category={flow.category}
        query={flow.query}
        onCategoryChange={(category) =>
          dispatch({ type: 'categoryChanged', category })
        }
        onQueryChange={(query) => dispatch({ type: 'queryChanged', query })}
        onSelect={(item) => dispatch({ type: 'itemSelected', item })}
      />
    )
    footer = <p className={styles.footerText}>Pick a result to continue</p>
  }

  // One Dialog for every step, so it keeps the element to return focus to.
  return (
    <Dialog
      {...dialog}
      size="add"
      title={title}
      headerStart={
        <Stepper
          label="Add review steps"
          steps={STEPS}
          current={STEP_INDEX[flow.step]}
          category={
            flow.step !== 'find' && item ? item.category : flow.category
          }
        />
      }
      bodyKey={flow.step}
      footer={footer}
    >
      {body}
    </Dialog>
  )
}
