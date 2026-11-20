import { useState } from 'react'
import { Outlet } from 'react-router'
import { useWatchlist, useWatchlistFacets } from '../../api/queries/watchlist'
import type { WatchlistPage as WatchlistPageData } from '../../api/types'
import {
  categoryLabel,
  FILTER_CATEGORIES,
  isFilterCategory,
} from '../../lib/categories'
import { useLoadMoreOnScroll } from '../../lib/useLoadMoreOnScroll'
import { Button } from '../../ui/Button/Button'
import { Chip } from '../../ui/Chip/Chip'
import { Icon } from '../../ui/Icon/Icon'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import grid from './grid.module.css'
import { toListParams, useWatchlistCategory } from './useWatchlistCategory'
import { WatchlistCard } from './WatchlistCard'
import { WatchlistEmpty } from './WatchlistEmpty'
import { WatchlistLoadError } from './WatchlistLoadError'
import { WatchlistNoMatches } from './WatchlistNoMatches'
import styles from './WatchlistPage.module.css'
import { WatchlistSkeleton } from './WatchlistSkeleton'

// From the loading board.
const GHOST_CHIP_WIDTHS = [64, 96, 84, 86, 128, 132, 86, 84]

const FALLBACK_SUBTITLE = 'Things to watch, play and read later.'

/**
 * Every page's entries, each once. Offset paging can repeat an entry on the
 * next page after one is added meanwhile.
 */
function uniqueEntries(pages: WatchlistPageData[]) {
  const seen = new Set<string>()
  return pages
    .flatMap((page) => page.data)
    .filter((entry) => {
      if (seen.has(entry.item.id)) return false
      seen.add(entry.item.id)
      return true
    })
}

function countLabel(total: number) {
  if (total === 0) return 'Nothing saved yet.'
  return `${total} ${total === 1 ? 'title' : 'titles'} to watch, play or read later.`
}

export function WatchlistPage() {
  const { category, setCategory } = useWatchlistCategory()
  const query = useWatchlist(toListParams(category))
  const facets = useWatchlistFacets()
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

  const entries = data ? uniqueEntries(data.pages) : []

  // When the counts fail, the list's own count stands in, if it's unfiltered.
  const total =
    facets.data?.total ??
    (category === '' && data && !query.isPlaceholderData
      ? data.pages[0]?.meta.pagination.count
      : undefined)

  // Branch on the data, not isError: a failed next page or background refetch
  // also sets isError, and the list it already has should stay.
  let state: 'error' | 'loading' | 'empty' | 'no-matches' | 'ready'
  if (!data && query.isError) {
    state = 'error'
  } else if (
    !data ||
    // An empty category page is "no matches" only once the counts say the
    // watchlist has something, and only for the category it was asked for.
    (entries.length === 0 &&
      ((category !== '' && facets.isPending) || query.isPlaceholderData))
  ) {
    state = 'loading'
  } else if (entries.length === 0 && (total === 0 || category === '')) {
    // Unfiltered and empty is empty, even when older counts say otherwise.
    state = 'empty'
  } else if (entries.length === 0) {
    state = 'no-matches'
  } else {
    state = 'ready'
  }

  // The board's first-load states show until the list has loaded once. After
  // that a failed or slow chip keeps the chips, so another can be picked.
  // Not while the counts are still deciding between empty and no matches.
  // Adjusted during render rather than in an effect.
  const [listShown, setListShown] = useState(false)
  if (data && state !== 'loading' && !listShown) setListShown(true)

  const firstLoad = !listShown
  const showChips = !firstLoad && state !== 'empty'

  function retry() {
    void query.refetch()
    // So the chips and the hero get their counts back too.
    if (facets.isError) void facets.refetch()
  }

  let subtitle
  if (firstLoad && state === 'error') {
    subtitle = <p className={styles.subtitle}>{FALLBACK_SUBTITLE}</p>
  } else if (state === 'empty') {
    // Not older counts that say otherwise.
    subtitle = <p className={styles.subtitle}>{countLabel(0)}</p>
  } else if (total !== undefined) {
    subtitle = <p className={styles.subtitle}>{countLabel(total)}</p>
  } else if (facets.isPending || query.isPending) {
    subtitle = <Skeleton className={styles.subtitleSkeleton} />
  } else {
    subtitle = <p className={styles.subtitle}>{FALLBACK_SUBTITLE}</p>
  }

  // Without the counts, the chips still filter. A chip the page can't filter
  // by isn't shown.
  const categories =
    facets.data?.categories.filter(({ id }) => isFilterCategory(id)) ??
    FILTER_CATEGORIES.map((id) => ({ id, count: undefined }))

  let body
  if (state === 'error') {
    body = <WatchlistLoadError onRetry={retry} />
  } else if (state === 'loading') {
    body = <WatchlistSkeleton />
  } else if (state === 'empty') {
    body = <WatchlistEmpty />
  } else if (state === 'no-matches') {
    body = (
      <WatchlistNoMatches
        category={category}
        total={total}
        onShowAll={() => setCategory('')}
      />
    )
  } else {
    body = (
      <>
        <p className={styles.countRow}>
          {category
            ? `${categoryLabel(category)} · newest first`
            : 'Newest first'}
        </p>
        <ul className={grid.grid}>
          {entries.map((entry) => (
            <li key={entry.item.id}>
              <WatchlistCard entry={entry} />
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>
            <Icon name="bookmark" size={13} className={styles.desktopOnly} />
            <span>
              <span className={styles.desktopOnly}>Your watchlist · </span>
              only you can see this
            </span>
          </span>
          <h1 className={styles.title}>Up next.</h1>
          {subtitle}
        </div>
      </section>
      {showChips && (
        <div
          role="group"
          aria-label="Filter by category"
          className={styles.chips}
        >
          <Chip
            className={styles.all}
            count={total}
            selected={category === ''}
            onClick={() => setCategory('')}
          >
            All
          </Chip>
          {categories.map(({ id, count }) => (
            <Chip
              key={id}
              category={id}
              count={count}
              selected={category === id}
              onClick={() => {
                if (isFilterCategory(id)) setCategory(id)
              }}
            >
              {categoryLabel(id)}
            </Chip>
          ))}
        </div>
      )}
      {firstLoad && state === 'loading' && (
        <div className={styles.ghostChips} aria-hidden="true">
          {GHOST_CHIP_WIDTHS.map((width, i) => (
            <Skeleton key={i} width={width} height={40} radius={12} />
          ))}
        </div>
      )}
      <div
        className={styles.results}
        // The last category's cards stay on screen while the next ones load.
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
                <span>Couldn’t load more titles.</span>
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
      {/* #131 and #132 add the add sheet and Review it here. */}
      <Outlet />
    </>
  )
}
