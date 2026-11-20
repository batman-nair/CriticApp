import { useEffect, useId, useState } from 'react'
import { useParams } from 'react-router'
import { ApiError } from '../../api/client'
import { useCategories } from '../../api/queries/categories'
import { useReview } from '../../api/queries/reviews'
import { Button } from '../../ui/Button/Button'
import { Dialog } from '../../ui/Dialog/Dialog'
import { useRouteDialog } from '../../ui/Dialog/useRouteDialog'
import { Icon } from '../../ui/Icon/Icon'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { Stepper } from '../../ui/Stepper/Stepper'
import { VisuallyHidden } from '../../ui/VisuallyHidden/VisuallyHidden'
import styles from './AddReviewPage.module.css'
import { FindStep } from './FindStep'
import { readLastCategory, writeLastCategory } from './lastCategory'
import { RateStep, UPDATE_NOTICE } from './RateStep'
import { SavedReview } from './SavedReview'
import { useAddFlow, type AddFlowAction, type AddStep } from './useAddFlow'
import { useSaveReview } from './useSaveReview'
import { useWatchlistStart } from './watchlistStart'
import { WriteStep } from './WriteStep'

const STEPS = ['Find', 'Rate', 'Write']

const STEP_INDEX: Record<AddStep, number> = {
  find: 0,
  rate: 1,
  write: 2,
  done: 3,
}

interface AddReviewPageProps {
  /**
   * Review it from a watchlist card (`/watchlist/review/:itemId`): starts on
   * Rate with that title instead of on Find.
   */
  fromWatchlist?: boolean
}

export function AddReviewPage({ fromWatchlist = false }: AddReviewPageProps) {
  const dialog = useRouteDialog()
  const params = useParams()
  const [initialCategory] = useState(() => readLastCategory() ?? 'movie')
  const [flow, dispatch] = useAddFlow(initialCategory)

  // Review it starts the flow on the title once, adjusted during render so
  // Find never paints first. Add another starts over on Find, not on it.
  const [startedOnce, setStartedOnce] = useState(false)
  const start = useWatchlistStart(
    fromWatchlist ? params.itemId : undefined,
    !startedOnce,
  )
  if (!startedOnce && start.status === 'ready' && start.item) {
    setStartedOnce(true)
    dispatch({
      type: 'started',
      item: start.item,
      onWatchlist: start.onWatchlist,
    })
  }
  const waiting = fromWatchlist && !startedOnce
  const categories = useCategories()
  const { save, isSaving } = useSaveReview(flow.reviewId, dispatch)
  const rateId = useId()
  const writeId = useId()

  // An already-reviewed pick fills the fields from its review. Id 0 never
  // asks, so nothing is fetched once the fields are in. The list's copy shown
  // as placeholder, or a stale cached one, may be older: only a fresh review
  // or one fetched for this pick counts, and the reducer takes the first one.
  const existing = useReview(
    flow.prefill === 'loading' ? (flow.reviewId ?? 0) : 0,
  )
  const { data: existingReview, error } = existing
  // A failed refetch counts as fetched and keeps the old data: not current.
  const current =
    !existing.isPlaceholderData &&
    !existing.isError &&
    (!existing.isStale || existing.isFetchedAfterMount)
  useEffect(() => {
    if (existingReview && current) {
      dispatch({ type: 'reviewLoaded', review: existingReview })
    }
  }, [existingReview, current, dispatch])
  // Deleted since the search: it's a new review after all.
  const missing = error instanceof ApiError && error.status === 404
  useEffect(() => {
    if (missing) dispatch({ type: 'reviewMissing' })
  }, [missing, dispatch])

  const { item } = flow
  const update = flow.mode === 'update'
  // Not while saving: the outcome would land on a flow that moved on.
  const go = (action: AddFlowAction) => {
    if (!isSaving) dispatch(action)
  }
  const ratingLabel = item
    ? (categories.data?.find((c) => c.id === item.category)?.rating_label ??
      null)
    : null

  const close = () => dialog.onOpenChange(false)

  let title
  let body
  let footer
  if (waiting) {
    // Review it's title is still loading, or couldn't be loaded.
    title = 'Rate it'
    if (start.status === 'not-found' || start.status === 'error') {
      const notFound = start.status === 'not-found'
      body = (
        <p role="alert" className={styles.startError}>
          {notFound
            ? 'Couldn’t find that title. It may have been removed.'
            : 'Couldn’t load this title.'}
        </p>
      )
      footer = (
        <div className={styles.actions}>
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
          {!notFound && <Button onClick={start.retry}>Try again</Button>}
        </div>
      )
    } else {
      body = (
        <div className={styles.starting} aria-busy="true">
          <div role="status">
            <VisuallyHidden>Loading…</VisuallyHidden>
          </div>
          <Skeleton className={styles.itemSkeleton} radius={16} />
          <Skeleton className={styles.ratingSkeleton} radius={16} />
        </div>
      )
    }
  } else if (flow.step === 'done' && flow.saved) {
    title = update ? 'Review updated' : 'Added to your reviews'
    // Only for the title Review it opened on: a create took it off the list.
    // Not after a 409 turned it into an update, which removed nothing.
    const removed =
      flow.mode === 'create' && flow.saved.item.id === flow.startItemId
    body = removed ? (
      <div className={styles.done}>
        <p className={styles.watchNote}>
          <Icon name="bookmark-check" size={16} className={styles.noteIcon} />
          Removed from your watchlist.
        </p>
        <SavedReview review={flow.saved} ratingLabel={ratingLabel} />
      </div>
    ) : (
      <SavedReview review={flow.saved} ratingLabel={ratingLabel} />
    )
    footer = (
      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: 'addAnother' })}
        >
          Add another
        </Button>
        <Button onClick={close}>Done</Button>
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
        // A 409 switched to an update here, on Write: say why.
        notice={flow.duplicate ? UPDATE_NOTICE : undefined}
        text={flow.text}
        error={flow.errors.text}
        formError={flow.formError}
        retrying={isSaving}
        onChangeItem={() => go({ type: 'change' })}
        onTextChange={(text) => dispatch({ type: 'textChanged', text })}
        onRetry={() => void save(flow)}
        onSubmit={() => void save(flow)}
      />
    )
    footer = (
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => go({ type: 'back' })}>
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
        onChangeItem={() => go({ type: 'change' })}
        onRatingChange={(rating) => dispatch({ type: 'ratingChanged', rating })}
        onTagsChange={(tags) => dispatch({ type: 'tagsChanged', tags })}
        onReload={() => void existing.refetch()}
        onRetry={() => void save(flow)}
        // Not before the review's fields are in, or they'd land on Write.
        onSubmit={() => {
          if (!loading) go({ type: 'next' })
        }}
      />
    )
    footer = (
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => go({ type: 'back' })}>
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
        onCategoryChange={(category) => {
          writeLastCategory(category)
          dispatch({ type: 'categoryChanged', category })
        }}
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
          current={waiting ? STEP_INDEX.rate : STEP_INDEX[flow.step]}
          category={
            flow.step !== 'find' && item ? item.category : flow.category
          }
        />
      }
      bodyKey={waiting ? `start-${start.status}` : flow.step}
      footer={footer}
    >
      {body}
    </Dialog>
  )
}
