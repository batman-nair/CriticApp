import { Outlet } from 'react-router'
import { useReviewList } from '../../api/queries/reviews'
import type { ReviewPage } from '../../api/types'
import { OWNER_USERNAME } from '../../config'
import { Button } from '../../ui/Button/Button'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { EmptyShelf } from './EmptyShelf'
import grid from './grid.module.css'
import { LoadError } from './LoadError'
import { ReviewCard } from './ReviewCard'
import { ReviewListSkeleton } from './ReviewListSkeleton'
import styles from './ReviewListPage.module.css'
import { useLoadMoreOnScroll } from './useLoadMoreOnScroll'

/**
 * Every page's reviews, each once. Offset paging under "recently updated" can
 * push a review onto the next page after an edit.
 */
function uniqueReviews(pages: ReviewPage[]) {
  const seen = new Set<number>()
  return pages
    .flatMap((page) => page.data)
    .filter((review) => {
      if (seen.has(review.id)) return false
      seen.add(review.id)
      return true
    })
}

function countLabel(count: number) {
  if (count === 0) return 'No reviews yet'
  return `${count} ${count === 1 ? 'review' : 'reviews'}, rated out of ten`
}

export function ReviewListPage() {
  const query = useReviewList({ username: OWNER_USERNAME })
  const {
    data,
    hasNextPage,
    fetchStatus,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = query
  const sentinelRef = useLoadMoreOnScroll({
    // Not during a background refetch either, even one paused offline:
    // fetchNextPage would cancel it.
    enabled: hasNextPage && fetchStatus === 'idle' && !isFetchNextPageError,
    onLoadMore: () => void fetchNextPage(),
  })

  const reviews = data ? uniqueReviews(data.pages) : []
  const count = data?.pages[0]?.meta.pagination.count

  // Branch on the data, not isError: a failed next page or background refetch
  // also sets isError, and the list it already has should stay.
  let body
  if (data) {
    body =
      reviews.length === 0 ? (
        <EmptyShelf />
      ) : (
        <ul className={grid.grid}>
          {reviews.map((review) => (
            <li key={review.id}>
              <ReviewCard review={review} />
            </li>
          ))}
        </ul>
      )
  } else if (query.isError) {
    body = (
      <LoadError error={query.error} onRetry={() => void query.refetch()} />
    )
  } else {
    body = <ReviewListSkeleton />
  }

  return (
    <>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          Everything I’ve <span className={styles.watched}>watched</span>,{' '}
          <br />
          <span className={styles.played}>played</span> and{' '}
          <span className={styles.read}>read</span>.
        </h1>
        {count !== undefined ? (
          <p className={styles.subtitle}>{countLabel(count)}</p>
        ) : (
          query.isPending && (
            <Skeleton
              className={styles.subtitleSkeleton}
              width={170}
              height={14}
              radius={7}
            />
          )
        )}
      </section>
      {/* The filters (#87) go between the hero and the results. */}
      <div className={styles.results}>
        {body}
        {data && (
          <>
            {hasNextPage && (
              <div ref={sentinelRef} className={styles.sentinel} />
            )}
            {/* Mounted with the list, so the text change is announced. */}
            <p role="status" className={styles.more}>
              {isFetchingNextPage ? 'Loading more…' : ''}
            </p>
            {/* The error flag stays set while its retry runs. */}
            {isFetchNextPageError && !isFetchingNextPage && (
              <div className={styles.moreError}>
                <span>Couldn’t load more reviews.</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void fetchNextPage()}
                >
                  Try again
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <Outlet />
    </>
  )
}
