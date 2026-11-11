import { useState } from 'react'
import { Outlet } from 'react-router'
import { useReviewFacets, useReviewList } from '../../api/queries/reviews'
import type { ReviewPage } from '../../api/types'
import { OWNER_USERNAME } from '../../config'
import { cx } from '../../lib/cx'
import { Button } from '../../ui/Button/Button'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { EmptyShelf } from './EmptyShelf'
import { FilterPanel } from './FilterPanel'
import grid from './grid.module.css'
import { LoadError } from './LoadError'
import { NoMatches } from './NoMatches'
import { ReviewCard } from './ReviewCard'
import { ReviewListSkeleton } from './ReviewListSkeleton'
import styles from './ReviewListPage.module.css'
import { useLoadMoreOnScroll } from './useLoadMoreOnScroll'
import {
  toFacetParams,
  toListParams,
  useReviewFilters,
} from './useReviewFilters'

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

function resultsLabel(count: number) {
  return count === 1 ? '1 review' : `${count} reviews`
}

export function ReviewListPage() {
  const { filters, isFiltered, setFilters, clearFilters } = useReviewFilters()
  const query = useReviewList(toListParams(filters))
  // The chips' counts and the language menu, for the filters as they are.
  const facets = useReviewFacets(toFacetParams(filters))
  // The hero counts every review. Without filters, the same query as above.
  const heroFacets = useReviewFacets({ username: OWNER_USERNAME })
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

  // The S5/S6 ghost panel shows until the list has loaded once. After that a
  // slow or failed filter keeps the live panel, so typing is never cut off.
  // Adjusted during render rather than in an effect.
  const [listShown, setListShown] = useState(false)
  if (data && !listShown) setListShown(true)
  const ghost = listShown ? null : query.isError ? 'unavailable' : 'loading'

  // Not while the last filter's page stands in: clearing a search that
  // matched nothing would flash the empty shelf and drop the focused search.
  const emptyShelf =
    data && !query.isPlaceholderData && !isFiltered && count === 0

  // When the counts fail, the list's own count stands in, if it's unfiltered.
  const heroTotal =
    heroFacets.data?.total ??
    (heroFacets.isError && !isFiltered && !query.isPlaceholderData
      ? count
      : undefined)

  function retry() {
    void query.refetch()
    // So the chips get their counts back too.
    if (facets.isError) void facets.refetch()
  }

  // Branch on the data, not isError: a failed next page or background refetch
  // also sets isError, and the list it already has should stay.
  let body
  if (emptyShelf) {
    body = <EmptyShelf />
  } else if (data) {
    body =
      reviews.length === 0 ? (
        <NoMatches />
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
    body = <LoadError error={query.error} onRetry={retry} />
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
        {/* S6 has no count. */}
        {ghost !== 'unavailable' &&
          (heroTotal !== undefined ? (
            <p className={styles.subtitle}>{countLabel(heroTotal)}</p>
          ) : (
            heroFacets.isPending && (
              <Skeleton
                className={styles.subtitleSkeleton}
                width={170}
                height={14}
                radius={7}
              />
            )
          ))}
      </section>
      {/* S3: the empty shelf has no filters. */}
      {!emptyShelf && (
        <FilterPanel
          filters={filters}
          setFilters={setFilters}
          facets={facets.data}
          ghost={ghost}
        />
      )}
      {listShown && !emptyShelf && (
        <div className={styles.countRow}>
          <span aria-live="polite">
            {count !== undefined ? resultsLabel(count) : ''}
          </span>
          {isFiltered && (
            <button
              type="button"
              className={styles.clear}
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <div
        className={cx(styles.results, ghost === 'loading' && styles.loading)}
        // The last filter's cards stay on screen while the next ones load.
        aria-busy={query.isPlaceholderData || undefined}
      >
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
