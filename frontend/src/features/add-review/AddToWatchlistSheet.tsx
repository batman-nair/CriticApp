import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router'
import { ApiError } from '../../api/client'
import { isSearchCategory } from '../../api/queries/search'
import { useAddToWatchlist } from '../../api/queries/watchlist'
import type { SearchCategory, SearchResult } from '../../api/types'
import { markSessionExpired } from '../../auth/markSessionExpired'
import type {
  WatchlistAddState,
  WatchlistOutlet,
} from '../../lib/watchlistOutlet'
import { Button } from '../../ui/Button/Button'
import { Dialog } from '../../ui/Dialog/Dialog'
import { useRouteDialog } from '../../ui/Dialog/useRouteDialog'
import styles from './AddToWatchlistSheet.module.css'
import { FindStep } from './FindStep'
import type { WatchlistRowStatus } from './SearchResultRow'

/** A tapped result: on its way, on the list, or reviewed meanwhile (409). */
type RowState = 'pending' | 'added' | 'reviewed'

/**
 * The category the page's link asked for. Movies without one, such as on a
 * direct link or a reload, as on the board.
 */
function startCategory(state: unknown): SearchCategory {
  const category = (state as Partial<WatchlistAddState> | null)?.category
  return typeof category === 'string' && isSearchCategory(category)
    ? category
    : 'movie'
}

function isApiError(error: unknown, status: number, code: string) {
  return (
    error instanceof ApiError && error.status === status && error.code === code
  )
}

/**
 * `/watchlist/add`: search and add titles with one tap each, from the add
 * sheet boards (1, 2 and 9; below 640px, 13, 14 and 21).
 */
export function AddToWatchlistSheet() {
  const dialog = useRouteDialog()
  const location = useLocation()
  const queryClient = useQueryClient()
  // Undefined outside the watchlist page, such as in a test of its own.
  const outlet = useOutletContext<WatchlistOutlet | undefined>()
  const add = useAddToWatchlist()

  const [category, setCategory] = useState(() => startCategory(location.state))
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Record<string, RowState>>({})
  // The titles added in this sheet, in order.
  const [added, setAdded] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // Read in the tap handler, so a second tap before the re-render sends
  // nothing.
  const inFlight = useRef(new Set<string>())

  function setRow(id: string, state: RowState | null) {
    setRows((current) => {
      const next = { ...current }
      if (state) next[id] = state
      else delete next[id]
      return next
    })
  }

  function status(result: SearchResult): WatchlistRowStatus {
    const row = rows[result.id]
    if (result.my_review || row === 'reviewed') {
      return { status: 'reviewed', fresh: false }
    }
    if (row === 'pending' || row === 'added') {
      return { status: 'on', fresh: true }
    }
    return { status: result.on_watchlist ? 'on' : 'add', fresh: false }
  }

  async function addResult(result: SearchResult) {
    const { id, title } = result
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    // On the list at once, and inert, while the request runs.
    setRow(id, 'pending')
    setError(null)
    try {
      const entry = await add.mutateAsync({ item_id: id })
      setRow(id, 'added')
      setAdded((titles) => [...titles, title])
      outlet?.onAdded(entry.item.id)
    } catch (caught) {
      if (isApiError(caught, 409, 'ALREADY_REVIEWED')) {
        setRow(id, 'reviewed')
      } else {
        setRow(id, null)
        if (isApiError(caught, 401, 'UNAUTHENTICATED')) {
          // The owner guard then goes to the login page, as FindStep does.
          markSessionExpired(queryClient)
        } else {
          setError(`Couldn’t add ${title}. Try again.`)
        }
      }
    } finally {
      inFlight.current.delete(id)
    }
  }

  let summary
  if (error) {
    summary = error
  } else if (added.length === 0) {
    summary = 'Nothing added yet'
  } else {
    const what = added.length === 1 ? added[0] : `${added.length} titles`
    summary = (
      <>
        <span className={styles.wide}>{what} added to your watchlist</span>
        <span className={styles.narrow}>{what} added</span>
      </>
    )
  }

  return (
    <Dialog
      {...dialog}
      size="add"
      title="Add to watchlist"
      description="Tap a title to save it. Add as many as you like."
      descriptionClassName={styles.description}
      footer={
        <div className={styles.footer}>
          {/* Always mounted, so each change is announced. */}
          <p
            role="status"
            className={styles.summary}
            data-tone={error ? 'error' : added.length > 0 ? 'added' : undefined}
          >
            {summary}
          </p>
          <Button
            size="lg"
            className={styles.done}
            onClick={() => dialog.onOpenChange(false)}
          >
            Done
          </Button>
        </div>
      }
    >
      <FindStep
        category={category}
        query={query}
        onCategoryChange={setCategory}
        onQueryChange={setQuery}
        onSelect={(result) => void addResult(result)}
        watchlistStatus={status}
      />
    </Dialog>
  )
}
