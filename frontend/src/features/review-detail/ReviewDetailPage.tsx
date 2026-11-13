import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useBlocker, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import { useCategories } from '../../api/queries/categories'
import { useDeleteReview, useReview } from '../../api/queries/reviews'
import { useSession } from '../../auth/useSession'
import { reviewCategory } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { Button } from '../../ui/Button/Button'
import { Dialog } from '../../ui/Dialog/Dialog'
import { useRouteDialog } from '../../ui/Dialog/useRouteDialog'
import { Icon } from '../../ui/Icon/Icon'
import { IconButton } from '../../ui/IconButton/IconButton'
import { DeleteConfirm } from './DeleteConfirm'
import { ReviewDetail } from './ReviewDetail'
import styles from './ReviewDetailPage.module.css'
import { ReviewDetailSkeleton } from './ReviewDetailSkeleton'
import { ReviewDetailStatus } from './ReviewDetailStatus'
import { ReviewEditForm } from './ReviewEditForm'
import { ReviewSteps } from './ReviewSteps'
import { useReviewEditor } from './useReviewEditor'
import { useReviewSteps } from './useReviewSteps'

export function ReviewDetailPage() {
  const id = Number(useParams().id)
  const dialog = useRouteDialog()
  const review = useReview(id)
  const categories = useCategories()
  const deleteReview = useDeleteReview(id)
  // While a delete is under way nothing else starts: it lands either way. That
  // includes a › already waiting for the next page.
  const deleting = deleteReview.isPending
  const steps = useReviewSteps(id, dialog.open && !deleting)
  const session = useSession()
  const editor = useReviewEditor(id)
  const formId = useId()
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const keepButtonRef = useRef<HTMLButtonElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { data } = review

  // The mode belongs to one review: showing another goes back to viewing.
  // Object.is, as an id that isn't one is NaN.
  const [modeId, setModeId] = useState(id)
  if (!Object.is(id, modeId)) {
    setModeId(id)
    editor.reset()
    setConfirmDelete(false)
  }

  // An id that isn't one never asks, so it's as missing as a 404.
  const notFound =
    !(Number.isInteger(id) && id > 0) ||
    (review.error instanceof ApiError && review.error.status === 404)

  // Leaves edit mode with focus on Edit, which only exists once rendered.
  function leaveEditing() {
    flushSync(() => editor.reset())
    editButtonRef.current?.focus()
  }

  // A save under way can't be cancelled: its PATCH lands either way.
  function cancelEditing() {
    if (!editor.isSaving) leaveEditing()
  }

  async function save() {
    if (await editor.save()) leaveEditing()
  }

  // Asks first, with focus on "Keep it", the safe choice.
  function askToDelete() {
    if (confirmDelete || deleting) return
    deleteReview.reset()
    flushSync(() => setConfirmDelete(true))
    keepButtonRef.current?.focus()
  }

  function keepReview() {
    if (deleting) return
    flushSync(() => setConfirmDelete(false))
    deleteButtonRef.current?.focus()
  }

  // Closing returns to the list, which the delete has already refetched.
  function deleteIt() {
    deleteReview.mutate(undefined, {
      onSuccess: () => dialog.onOpenChange(false),
    })
  }

  // A 404 wins over a cached copy, so a review deleted elsewhere goes. Any
  // other failed background refetch keeps the review on screen.
  let title
  let category
  let body
  let editing = false
  let headerEnd
  let footer
  if (data && !notFound) {
    const { item } = data
    title = item.title
    // As ReviewDetail tints itself, so the dialog matches.
    category =
      item.category === 'anime'
        ? reviewCategory(item.category, item.details.media_type)
        : item.category
    // Undefined while /categories loads, null when it doesn't know.
    const ratingLabel = categories.isPending
      ? undefined
      : (categories.data?.find((c) => c.id === item.category)?.rating_label ??
        null)
    const isOwn =
      session.isOwner && session.user?.username === data.user.username
    const draft = isOwn ? editor.draft : null
    editing = draft !== null
    body = (
      <ReviewDetail key={id} review={data} ratingLabel={ratingLabel}>
        {draft ? (
          <ReviewEditForm
            id={formId}
            review={data}
            ratingLabel={ratingLabel}
            draft={draft}
            errors={editor.errors}
            formError={editor.formError}
            onChange={editor.change}
            onSubmit={() => void save()}
          />
        ) : undefined}
      </ReviewDetail>
    )
    if (editing) {
      headerEnd = (
        <>
          <Button
            variant="secondary"
            size="sm"
            className={cx(styles.soft, styles.action)}
            aria-disabled={editor.isSaving || undefined}
            onClick={cancelEditing}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            size="sm"
            className={styles.action}
            busy={editor.isSaving}
          >
            Save
          </Button>
        </>
      )
    } else if (isOwn) {
      headerEnd = (
        <>
          <Button
            ref={editButtonRef}
            variant="secondary"
            size="sm"
            className={cx(styles.soft, styles.edit)}
            aria-disabled={deleting || undefined}
            onClick={() => {
              if (deleting) return
              setConfirmDelete(false)
              editor.start(data)
            }}
          >
            <Icon name="pencil" size={16} />
            <span className={styles.editLabel}>Edit</span>
          </Button>
          <IconButton
            ref={deleteButtonRef}
            label="Delete review"
            variant="soft"
            size="sm"
            className={cx(styles.soft, styles.icon)}
            aria-disabled={deleting || undefined}
            onClick={askToDelete}
          >
            <Icon name="trash" />
          </IconButton>
        </>
      )
      if (confirmDelete) {
        footer = (
          <DeleteConfirm
            title={item.title}
            busy={deleteReview.isPending}
            failed={deleteReview.isError}
            onKeep={keepReview}
            onDelete={deleteIt}
            keepRef={keepButtonRef}
          />
        )
      }
    }
  } else if (notFound) {
    title = 'Review not found'
    body = (
      <ReviewDetailStatus
        kind="not-found"
        onAction={() => dialog.onOpenChange(false)}
      />
    )
  } else if (review.isError) {
    title = 'Review'
    body = (
      <ReviewDetailStatus kind="error" onAction={() => void review.refetch()} />
    )
  } else {
    title = 'Review'
    body = <ReviewDetailSkeleton />
  }

  // Unsaved edits aren't dropped by Esc, a click outside or a drag down.
  const guarded = editing && editor.dirty

  // Nor by the browser's Back or Forward, which can't be told apart from an
  // edge swipe on a phone. Only POP: the redirect to /login on a 401 pushes.
  // The dialog's own close goes Back too, but never while guarded.
  const blocker = useBlocker(
    ({ historyAction }) => guarded && historyAction === 'POP',
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('Discard your changes?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  // One Dialog for every state and every review, so it keeps the element to
  // return focus to.
  return (
    <Dialog
      {...dialog}
      size="detail"
      hideTitle
      title={title}
      category={category}
      bodyKey={`${id}-${editing ? 'edit' : 'view'}`}
      headerStart={
        editing ? undefined : (
          <ReviewSteps
            {...steps}
            {...(deleting && { canGoPrevious: false, canGoNext: false })}
          />
        )
      }
      headerEnd={headerEnd}
      hideClose={editing}
      dismissible={!guarded}
      footer={footer}
    >
      {body}
    </Dialog>
  )
}
