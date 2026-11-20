import { Link } from 'react-router'
import { categoryLabel, categoryVars } from '../../lib/categories'
import { Button } from '../../ui/Button/Button'
import { buttonClass } from '../../ui/Button/buttonClass'
import type { AddToWatchlistLink } from './useAddToWatchlistLink'
import styles from './WatchlistNoMatches.module.css'

// One title of the category, from the board.
const ADD_LABELS = new Map([
  ['movie', 'Add a movie'],
  ['series', 'Add a series'],
  ['game', 'Add a game'],
  ['anime:series', 'Add an anime series'],
  ['anime:movie', 'Add an anime movie'],
  ['manga', 'Add a manga'],
  ['book', 'Add a book'],
])

interface WatchlistNoMatchesProps {
  /** The chip that matches nothing. */
  category: string
  /** Every entry, or undefined when the counts failed. */
  total?: number
  /** Opens the add sheet on this category. */
  addLink: AddToWatchlistLink
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
  addLink,
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
        <Link
          {...addLink}
          preventScrollReset
          className={buttonClass({
            variant: 'primary',
            size: 'lg',
            className: styles.add,
          })}
        >
          {ADD_LABELS.get(category) ?? 'Add a title'}
        </Link>
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
