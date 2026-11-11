import { useEffect, useEffectEvent, useState } from 'react'

interface LoadMoreOptions {
  /**
   * False while a page loads or refetches, when there are no more, or after a
   * failure.
   */
  enabled: boolean
  onLoadMore: () => void
}

/**
 * Calls `onLoadMore` when the sentinel comes within 600px of the viewport.
 * Returns the ref for the sentinel.
 *
 * The observer is created afresh each time `enabled` turns true, and a new
 * observer reports at once. So when the sentinel is still in view after a page
 * arrives, the next page loads too, rather than waiting for a scroll that
 * never comes.
 */
export function useLoadMoreOnScroll({ enabled, onLoadMore }: LoadMoreOptions) {
  // State, not a ref object, so a new sentinel element re-runs the effect.
  const [sentinel, setSentinel] = useState<Element | null>(null)
  // Not a dependency: an inline callback mustn't reconnect on every render.
  const loadMore = useEffectEvent(onLoadMore)

  useEffect(() => {
    if (!enabled || !sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '0px 0px 600px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [enabled, sentinel])

  return setSentinel
}
