import { categoryLabel, categoryVars } from '../../lib/categories'
import { Button } from '../../ui/Button/Button'
import styles from './WatchlistNoMatches.module.css'

interface WatchlistNoMatchesProps {
  /** The chip that matches nothing. */
  category: string
  /** Every entry, or undefined when the counts failed. */
  total?: number
  onShowAll: () => void
}

function othersLine(total: number | undefined) {
  if (total === undefined) return 'Your other titles are under All.'
  if (total === 1) return 'Your other title is under All.'
  return `Your other ${total} titles are under All.`
}

/** The category has no entries, but the watchlist has some. */
export function WatchlistNoMatches({
  category,
  total,
  onShowAll,
}: WatchlistNoMatchesProps) {
  const label = categoryLabel(category)

  return (
    <div className={styles.empty} style={categoryVars(category)}>
      <span className={styles.category}>
        <span className={styles.dot} aria-hidden="true" />
        {label}
      </span>
      <h2 className={styles.title}>
        No {label.toLowerCase()} on your watchlist
      </h2>
      <p className={styles.text}>{othersLine(total)}</p>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="lg"
          className={styles.showAll}
          onClick={onShowAll}
        >
          Show all
        </Button>
      </div>
    </div>
  )
}
