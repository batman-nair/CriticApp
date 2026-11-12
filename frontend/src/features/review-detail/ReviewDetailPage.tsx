import { useParams } from 'react-router'
import { ApiError } from '../../api/client'
import { useCategories } from '../../api/queries/categories'
import { useReview } from '../../api/queries/reviews'
import { reviewCategory } from '../../lib/categories'
import { Dialog } from '../../ui/Dialog/Dialog'
import { useRouteDialog } from '../../ui/Dialog/useRouteDialog'
import { ReviewDetail } from './ReviewDetail'
import { ReviewDetailSkeleton } from './ReviewDetailSkeleton'
import { ReviewDetailStatus } from './ReviewDetailStatus'

export function ReviewDetailPage() {
  const id = Number(useParams().id)
  const dialog = useRouteDialog()
  const review = useReview(id)
  const categories = useCategories()
  const { data } = review

  // An id that isn't one never asks, so it's as missing as a 404.
  const notFound =
    !(Number.isInteger(id) && id > 0) ||
    (review.error instanceof ApiError && review.error.status === 404)

  // Branch on the data first: a failed background refetch keeps the review.
  let title
  let category
  let body
  if (data) {
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
    body = <ReviewDetail key={id} review={data} ratingLabel={ratingLabel} />
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

  // One Dialog for every state and every review, so it keeps the element to
  // return focus to.
  return (
    <Dialog
      {...dialog}
      size="detail"
      hideTitle
      title={title}
      category={category}
      bodyKey={id}
    >
      {body}
    </Dialog>
  )
}
