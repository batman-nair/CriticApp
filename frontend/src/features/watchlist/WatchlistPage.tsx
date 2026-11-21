import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useMatch, useOutlet } from 'react-router'
import { ApiError } from '../../api/client'
import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useWatchlist,
  useWatchlistFacets,
} from '../../api/queries/watchlist'
import type {
  WatchlistEntry,
  WatchlistPage as WatchlistPageData,
} from '../../api/types'
import { markSessionExpired } from '../../auth/markSessionExpired'
import { isFilterCategory } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { useLoadMoreOnScroll } from '../../lib/useLoadMoreOnScroll'
import type { WatchlistOutlet } from '../../lib/watchlistOutlet'
import { Button } from '../../ui/Button/Button'
import { buttonClass } from '../../ui/Button/buttonClass'
import { FilterPanel } from '../../ui/FilterPanel/FilterPanel'
import { Icon } from '../../ui/Icon/Icon'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { Toast } from '../../ui/Toast/Toast'
import grid from './grid.module.css'
import {
  searchCategoryFor,
  useAddToWatchlistLink,
} from './useAddToWatchlistLink'
import {
  toFacetParams,
  toListParams,
  useWatchlistFilters,
  WATCHLIST_SORTS,
} from './useWatchlistFilters'
import { WatchlistCard } from './WatchlistCard'
import { WatchlistEmpty } from './WatchlistEmpty'
import { WatchlistLoadError } from './WatchlistLoadError'
import { WatchlistNoMatches } from './WatchlistNoMatches'
import { WatchlistNoResults } from './WatchlistNoResults'
import styles from './WatchlistPage.module.css'
import { WatchlistSkeleton } from './WatchlistSkeleton'

const GHOST_PLACEHOLDERS = {
  loading: 'Loading your watchlist…',
  unavailable: 'Search is unavailable right now',
}

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

/** What the toast says. `id` tells one notice from the next. */
type Notice =
  | {
      kind: 'removed'
      id: number
      entry: WatchlistEntry
      /** Whether the remove went through. Never rejects. */
      removal: Promise<boolean>
    }
  | { kind: 'error'; id: number; text: string }

function countLabel(total: number) {
  if (total === 0) return 'Nothing saved yet.'
  return `${total} ${total === 1 ? 'title' : 'titles'} to watch, play or read later.`
}

function resultsLabel(count: number) {
  return count === 1 ? '1 title' : `${count} titles`
}

export function WatchlistPage() {
  const { filters, isFiltered, setFilters, clearFilters } =
    useWatchlistFilters()
  const query = useWatchlist(toListParams(filters))
  // The chips' counts and the language menu, for the filters as they are.
  const facets = useWatchlistFacets(toFacetParams(filters))
  // The hero counts every entry: the header tab's query.
  const heroFacets = useWatchlistFacets()
  const addLink = useAddToWatchlistLink()
  // "Add a <category>" starts the sheet on the chip's category.
  const addInCategoryLink = useAddToWatchlistLink(
    isFilterCategory(filters.category)
      ? searchCategoryFor(filters.category)
      : undefined,
  )
  const {
    data,
    hasNextPage,
    fetchStatus,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = query

  // The session ran out while the page was open: the owner guard then goes
  // to the login page, which comes back here. Retrying would only 401 again.
  const queryClient = useQueryClient()
  const unauthenticated = [query.error, facets.error, heroFacets.error].some(
    (error) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.code === 'UNAUTHENTICATED',
  )
  useEffect(() => {
    if (unauthenticated) markSessionExpired(queryClient)
  }, [unauthenticated, queryClient])

  // The cards added in the add sheet's last visit are outlined. Opening it
  // again clears them, as on the board. Adjusted during render.
  const sheetOpen = useMatch('/watchlist/add') !== null
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [wasSheetOpen, setWasSheetOpen] = useState(sheetOpen)
  if (sheetOpen !== wasSheetOpen) {
    setWasSheetOpen(sheetOpen)
    if (sheetOpen) setHighlighted(new Set())
  }

  // Something was added: clear the filters, so it shows, once the sheet has
  // closed. The sort stays. Not while it's open, or its closing
  // `navigate(-1)` would undo the write. A flag, not `highlighted`, so a
  // filter picked later stays picked; and an add that lands after Done still
  // resets.
  const resetPending = useRef(false)
  useEffect(() => {
    if (sheetOpen || !resetPending.current) return
    resetPending.current = false
    clearFilters({ replace: true })
  }, [sheetOpen, highlighted, clearFilters])

  const entries = useMemo(() => (data ? uniqueEntries(data.pages) : []), [data])

  // Remove, with Undo in a toast.
  const remove = useRemoveFromWatchlist()
  const add = useAddToWatchlist()
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeId = useRef(0)
  const undoRef = useRef<HTMLButtonElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  // Set when Remove was pressed from the keyboard, so focus can go to Undo.
  // Not after a click: focus in the toast pauses its timer.
  const focusUndo = useRef(false)

  /** Not over a newer title's Undo, which it would take away. */
  function showError(itemId: string, text: string) {
    const id = ++noticeId.current
    setNotice((current) =>
      current?.kind === 'removed' && current.entry.item.id !== itemId
        ? current
        : { kind: 'error', id, text },
    )
  }

  function handleRemove(
    entry: WatchlistEntry,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    const removal = remove.mutateAsync(entry.item.id).then(
      () => true,
      () => false,
    )
    // Replaces whatever the toast said.
    setNotice({ kind: 'removed', id: ++noticeId.current, entry, removal })
    focusUndo.current = event.detail === 0
    void removal.then((removed) => {
      // The card is back already: the cache was rolled back.
      if (!removed) {
        showError(
          entry.item.id,
          `Couldn’t remove ${entry.item.title}. Try again.`,
        )
      }
    })
  }

  async function handleUndo() {
    if (notice?.kind !== 'removed') return
    const { entry, removal } = notice
    setNotice(null)
    // Not before the DELETE has settled, or it could land after the POST.
    // A failed remove has its own message.
    if (!(await removal)) return
    try {
      // The original date puts it back in its place; the list refetches.
      await add.mutateAsync({
        item_id: entry.item.id,
        added_at: entry.added_at,
      })
    } catch {
      showError(
        entry.item.id,
        `Couldn’t put ${entry.item.title} back on your watchlist.`,
      )
    }
  }

  useEffect(() => {
    if (!focusUndo.current || notice?.kind !== 'removed') return
    focusUndo.current = false
    undoRef.current?.focus()
  }, [notice])

  // One object, so the sheets re-render only when the list's data changes,
  // not with every page render.
  const outlet = useMemo<WatchlistOutlet>(
    () => ({
      onAdded: (itemId) => {
        resetPending.current = true
        setHighlighted((ids) => new Set(ids).add(itemId))
      },
      entries,
      entriesPending: !data && query.isPending,
    }),
    [entries, data, query.isPending],
  )

  // The boards never show the toast over a sheet. Opening one (the add sheet
  // or Review it) dismisses it; the removal stays. Adjusted during render.
  const child = useOutlet(outlet)
  const childOpen = child !== null
  const [wasChildOpen, setWasChildOpen] = useState(childOpen)
  if (childOpen !== wasChildOpen) {
    setWasChildOpen(childOpen)
    if (childOpen) setNotice(null)
  }

  const sentinelRef = useLoadMoreOnScroll({
    // Not during a background refetch either, even one paused offline:
    // fetchNextPage would cancel it.
    enabled: hasNextPage && fetchStatus === 'idle' && !isFetchNextPageError,
    onLoadMore: () => void fetchNextPage(),
  })

  const count = data?.pages[0]?.meta.pagination.count

  // When the counts fail, the list's own count stands in, if it's unfiltered.
  const total =
    heroFacets.data?.total ??
    (!isFiltered && data && !query.isPlaceholderData ? count : undefined)

  // Branch on the data, not isError: a failed next page or background refetch
  // also sets isError, and the list it already has should stay.
  let state: 'error' | 'loading' | 'empty' | 'no-matches' | 'ready'
  if (!data && query.isError) {
    state = 'error'
  } else if (
    !data ||
    // An empty filtered page is "no matches" only once the counts say the
    // watchlist has something, and only for the filters it was asked for.
    (entries.length === 0 &&
      ((isFiltered && heroFacets.isPending) || query.isPlaceholderData))
  ) {
    state = 'loading'
  } else if (entries.length === 0 && (total === 0 || !isFiltered)) {
    // Unfiltered and empty is empty, even when older counts say otherwise.
    state = 'empty'
  } else if (entries.length === 0) {
    state = 'no-matches'
  } else {
    state = 'ready'
  }

  // The board's first-load states and the ghost panel show until the list
  // has loaded once. After that a failed or slow filter keeps the live panel,
  // so typing is never cut off. Not while the counts are still deciding
  // between empty and no matches. Adjusted during render rather than in an
  // effect.
  const [listShown, setListShown] = useState(false)
  if (data && state !== 'loading' && !listShown) setListShown(true)

  const firstLoad = !listShown
  const ghost = !firstLoad
    ? null
    : state === 'error'
      ? 'unavailable'
      : 'loading'
  // The empty state has no filters.
  const showPanel = state !== 'empty'
  const showLivePanel = showPanel && !firstLoad

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
    // So the chips and the hero get their counts back too.
    if (facets.isError) void facets.refetch()
    if (heroFacets.isError) void heroFacets.refetch()
  }

  let subtitle
  if (firstLoad && state === 'error') {
    subtitle = <p className={styles.subtitle}>{FALLBACK_SUBTITLE}</p>
  } else if (state === 'empty') {
    // Not older counts that say otherwise.
    subtitle = <p className={styles.subtitle}>{countLabel(0)}</p>
  } else if (total !== undefined) {
    subtitle = <p className={styles.subtitle}>{countLabel(total)}</p>
  } else if (heroFacets.isPending || query.isPending) {
    subtitle = <Skeleton className={styles.subtitleSkeleton} />
  } else {
    subtitle = <p className={styles.subtitle}>{FALLBACK_SUBTITLE}</p>
  }

  // A chip the page can't filter by isn't shown. Without the counts, the
  // panel's chips still filter.
  const panelFacets = facets.data && {
    ...facets.data,
    categories: facets.data.categories.filter(({ id }) => isFilterCategory(id)),
  }

  let body
  if (state === 'error') {
    body = <WatchlistLoadError onRetry={retry} />
  } else if (state === 'loading') {
    body = <WatchlistSkeleton />
  } else if (state === 'empty') {
    body = <WatchlistEmpty addLink={addLink} />
  } else if (state === 'no-matches') {
    // Only a category: the board's own state, which offers to add one.
    body =
      filters.category && !filters.q && !filters.language ? (
        <WatchlistNoMatches
          category={filters.category}
          total={total}
          addLink={addInCategoryLink}
          onShowAll={() => setFilters({ category: '' })}
        />
      ) : (
        <WatchlistNoResults />
      )
  } else {
    body = (
      <ul className={grid.grid}>
        {entries.map((entry) => (
          <li key={entry.item.id}>
            <WatchlistCard
              entry={entry}
              fresh={highlighted.has(entry.item.id)}
              onRemove={(event) => handleRemove(entry, event)}
            />
          </li>
        ))}
      </ul>
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
        <Link
          {...addLink}
          preventScrollReset
          className={buttonClass({
            variant: 'primary',
            size: 'lg',
            // The phone board has it only beside the chips.
            className: cx(styles.add, !showLivePanel && styles.addNoPanel),
          })}
        >
          <Icon name="plus" size={16} strokeWidth={2.2} />
          <span>
            Add <span className={styles.desktopOnly}>to watchlist</span>
          </span>
        </Link>
      </section>
      {showPanel && (
        <FilterPanel
          key={clears}
          focusSearch={clears > 0}
          filters={filters}
          setFilters={setFilters}
          facets={panelFacets}
          ghost={ghost}
          searchLabel="Search your watchlist"
          searchPlaceholder="Search your watchlist — a title, a genre, a name"
          ghostPlaceholders={GHOST_PLACEHOLDERS}
          sorts={WATCHLIST_SORTS}
        />
      )}
      {listShown && state !== 'empty' && (
        <div className={styles.countRow}>
          <span aria-live="polite">
            {count !== undefined ? resultsLabel(count) : ''}
          </span>
          {isFiltered && (
            <button type="button" className={styles.clear} onClick={clearAll}>
              Clear filters
            </button>
          )}
        </div>
      )}
      <div
        ref={resultsRef}
        // Where focus goes when the toast closes with focus in it.
        tabIndex={-1}
        className={styles.results}
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
      <Toast
        // An error that comes in while a sheet is open waits for it to close.
        open={notice !== null && !childOpen}
        messageKey={notice?.id}
        onClose={() => setNotice(null)}
        action={
          notice?.kind === 'removed'
            ? { label: 'Undo', onClick: () => void handleUndo() }
            : undefined
        }
        actionRef={undoRef}
        returnFocusRef={resultsRef}
      >
        {notice?.kind === 'removed' && (
          <>
            Removed <strong>{notice.entry.item.title}</strong>
            {/* The phone board's copy is shorter. */}
            <span className={styles.desktopOnly}> from your watchlist</span>.
          </>
        )}
        {notice?.kind === 'error' && notice.text}
      </Toast>
      {/* The add sheet and Review it, which starts on a loaded card's title. */}
      {child}
    </>
  )
}
