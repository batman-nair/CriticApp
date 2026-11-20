import { Link, matchPath, useLocation } from 'react-router'
import { useWatchlistFacets } from '../api/queries/watchlist'
import { useSession } from '../auth/useSession'
import { cx } from '../lib/cx'
import { Icon } from '../ui/Icon/Icon'
import styles from './HeaderTabs.module.css'

/** The review list and the dialogs it opens over itself. */
const REVIEW_PATHS = ['/', '/reviews/:id', '/add']

function useCurrentTab(): 'reviews' | 'watchlist' | null {
  const { pathname } = useLocation()
  if (matchPath('/watchlist/*', pathname)) return 'watchlist'
  if (REVIEW_PATHS.some((pattern) => matchPath(pattern, pathname))) {
    return 'reviews'
  }
  return null
}

function WatchlistTab({ current }: { current: boolean }) {
  // The same query as the page's chips, so one request serves both.
  const { data } = useWatchlistFacets()
  return (
    <Link
      to="/watchlist"
      className={styles.tab}
      aria-current={current ? 'page' : undefined}
    >
      <Icon name="bookmark" size={14} className={styles.icon} />
      Watchlist
      {/* The space makes the link's name "Watchlist 3"; the flex gap draws it. */}
      {data !== undefined && data.total > 0 && (
        <>
          {' '}
          <span className={styles.count}>{data.total}</span>
        </>
      )}
    </Link>
  )
}

/**
 * Reviews | Watchlist, for the owner only. Nothing while the session loads,
 * so other visitors never see the tabs appear and vanish.
 */
export function HeaderTabs({ className }: { className?: string }) {
  const { isOwner } = useSession()
  const current = useCurrentTab()
  if (!isOwner) return null

  return (
    <nav aria-label="Main" className={cx(styles.tabs, className)}>
      <Link
        to="/"
        className={styles.tab}
        aria-current={current === 'reviews' ? 'page' : undefined}
      >
        Reviews
      </Link>
      <WatchlistTab current={current === 'watchlist'} />
    </nav>
  )
}
