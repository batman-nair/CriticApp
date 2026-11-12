import { useEffect, useEffectEvent, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router'
import type { Review } from '../../api/types'
import type { ReviewListOutlet } from '../../lib/reviewListOutlet'

/** A › pressed on the last loaded review, waiting for the next page. */
interface Pending {
  after: number
  /** loadMore() has settled, whether or not it brought a page. */
  settled: boolean
}

export interface ReviewSteps {
  previous: Review | undefined
  next: Review | undefined
  canGoPrevious: boolean
  /** There's a next review, or a next page that may hold one. */
  canGoNext: boolean
  isLoadingNext: boolean
  goPrevious: () => void
  goNext: () => void
}

/**
 * ‹ › through the reviews the list behind has loaded, in its order. Each step
 * replaces the URL and keeps its state and query, so closing still goes Back
 * to the list once.
 */
export function useReviewSteps(id: number, open: boolean): ReviewSteps {
  const list = useOutletContext<ReviewListOutlet | undefined>()
  const location = useLocation()
  const navigate = useNavigate()

  const reviews = list?.reviews ?? []
  const index = reviews.findIndex((review) => review.id === id)
  const previous = index > 0 ? reviews[index - 1] : undefined
  const next = index >= 0 ? reviews[index + 1] : undefined
  const canLoadMore =
    index >= 0 && index === reviews.length - 1 && !!list?.hasNextPage
  const isLoadingMore = list?.isLoadingMore ?? false

  // Dropped when the dialog closes or shows another review, and once the load
  // has settled with nothing to step to: the list was busy, or it failed.
  const [pending, setPending] = useState<Pending | null>(null)
  if (
    pending &&
    (!open ||
      pending.after !== id ||
      (pending.settled && !isLoadingMore && !next))
  ) {
    setPending(null)
  }
  const waiting = pending !== null && pending.after === id

  function go(to: number) {
    void navigate(
      { pathname: `/reviews/${to}`, search: location.search },
      { replace: true, state: location.state, preventScrollReset: true },
    )
  }

  // The page has landed: step to its first review. Going there changes the id,
  // which drops the pending step.
  const landed = waiting && open ? next?.id : undefined
  const goLanded = useEffectEvent(go)
  useEffect(() => {
    if (landed !== undefined) goLanded(landed)
  }, [landed])

  function goPrevious() {
    if (open && previous) go(previous.id)
  }

  function goNext() {
    if (!open || waiting || !list) return
    if (next) {
      go(next.id)
    } else if (canLoadMore) {
      const request = { after: id, settled: false }
      setPending(request)
      void list.loadMore().finally(() => {
        setPending((current) =>
          current === request ? { ...request, settled: true } : current,
        )
      })
    }
  }

  return {
    previous,
    next,
    canGoPrevious: previous !== undefined,
    canGoNext: next !== undefined || canLoadMore,
    isLoadingNext: waiting,
    goPrevious,
    goNext,
  }
}
