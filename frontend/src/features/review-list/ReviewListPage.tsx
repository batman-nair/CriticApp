import { useState } from 'react'
import { Outlet } from 'react-router'
import { useReviewFacets, useReviewList } from '../../api/queries/reviews'
import type { ReviewPage } from '../../api/types'
import { cx } from '../../lib/cx'
import type { ReviewListOutlet } from '../../lib/reviewListOutlet'
import { useLoadMoreOnScroll } from '../../lib/useLoadMoreOnScroll'
import { Button } from '../../ui/Button/Button'
import { FilterPanel } from '../../ui/FilterPanel/FilterPanel'
import { VisuallyHidden } from '../../ui/VisuallyHidden/VisuallyHidden'
import { EmptyShelf } from './EmptyShelf'
import grid from './grid.module.css'
import { LoadError } from './LoadError'
import { NoMatches } from './NoMatches'
import { ReviewCard } from './ReviewCard'
import { ReviewListSkeleton } from './ReviewListSkeleton'
import styles from './ReviewListPage.module.css'
import {
  SORTS,
  toFacetParams,
  toListParams,
  useReviewFilters,
} from './useReviewFilters'

const GHOST_PLACEHOLDERS = {
  loading: 'Loading your reviews…',
  unavailable: 'Search is unavailable right now',
}

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

function resultsLabel(count: number) {
  return count === 1 ? '1 review' : `${count} reviews`
}

export function ReviewListPage() {
  const { filters, isFiltered, setFilters, clearFilters } = useReviewFilters()
  const query = useReviewList(toListParams(filters))
  // The chips' counts and the language menu, for the filters as they are.
  const facets = useReviewFacets(toFacetParams(filters))
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
  // For the detail's ›. The sentinel's guard, but a failed page may be asked
  // for again.
  const loadMore = () =>
    hasNextPage && fetchStatus === 'idle' ? fetchNextPage() : Promise.resolve()
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

  // "Clear filters" starts the panel afresh: a search still being typed is
  // dropped rather than written after the clear, and the search box takes the
  // focus from the button, which goes away.
  const [clears, setClears] = useState(0)
  function clearAll() {
    clearFilters()
    setClears((n) => n + 1)
  }

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
      </section>
      {/* S3: the empty shelf has no filters. */}
      {!emptyShelf && (
        <FilterPanel
          key={clears}
          focusSearch={clears > 0}
          filters={filters}
          setFilters={setFilters}
          facets={facets.data}
          ghost={ghost}
          searchLabel="Search reviews"
          searchPlaceholder="Search my reviews — a title, a genre, a name, a word I used"
          ghostPlaceholders={GHOST_PLACEHOLDERS}
          sorts={SORTS}
        />
      )}
      {listShown && !emptyShelf && (
        <div className={styles.countRow}>
          {/* Not shown, but still announced when the filters change. */}
          <span aria-live="polite">
            <VisuallyHidden>
              {count !== undefined ? resultsLabel(count) : ''}
            </VisuallyHidden>
          </span>
          {isFiltered && (
            <button type="button" className={styles.clear} onClick={clearAll}>
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
      <Outlet
        context={
          {
            reviews,
            hasNextPage,
            loadMore,
            isLoadingMore: isFetchingNextPage,
          } satisfies ReviewListOutlet
        }
      />
    </>
  )
}
