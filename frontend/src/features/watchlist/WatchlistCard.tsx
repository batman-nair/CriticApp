import { useId, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router'
import type { WatchlistEntry } from '../../api/types'
import { categoryVars, reviewCategory } from '../../lib/categories'
import { formatYears } from '../../lib/format'
import { fromParentState } from '../../ui/Dialog/useRouteDialog'
import { Icon } from '../../ui/Icon/Icon'
import { IconButton } from '../../ui/IconButton/IconButton'
import { Poster } from '../../ui/Poster/Poster'
import { singularLabel } from './singularLabel'
import styles from './WatchlistCard.module.css'

interface WatchlistCardProps {
  entry: WatchlistEntry
  /** Just added in the add sheet: outlined until the sheet opens again. */
  fresh?: boolean
  /** The click, so the page can tell a keyboard press (`detail` 0). */
  onRemove: (event: MouseEvent<HTMLButtonElement>) => void
}

export function WatchlistCard({
  entry,
  fresh = false,
  onRemove,
}: WatchlistCardProps) {
  const titleId = useId()
  const location = useLocation()
  const { item } = entry
  const category =
    item.category === 'anime'
      ? reviewCategory(item.category, item.details.media_type)
      : item.category
  const years = formatYears(item.start_year, item.end_year)

  return (
    <article
      className={styles.card}
      style={categoryVars(category)}
      aria-labelledby={titleId}
      data-fresh={fresh || undefined}
    >
      {/* Poster clips its root, so the ribbon sits beside it. */}
      <div className={styles.cover}>
        <Poster
          className={styles.poster}
          src={item.image_url}
          title={item.title}
          alt={`Poster for ${item.title}`}
          category={category}
        />
        <span className={styles.ribbon} aria-hidden="true" />
      </div>
      <div className={styles.body}>
        <span className={styles.meta}>
          <span className={styles.dot} aria-hidden="true" />
          {singularLabel(category)}
          {years && ` · ${years}`}
        </span>
        <h2 id={titleId} className={styles.title}>
          {/* Stretched over the card by ::after; the actions sit above it. */}
          <Link
            className={styles.link}
            to={{
              pathname: `/watchlist/items/${encodeURIComponent(item.id)}`,
              search: location.search,
            }}
            state={fromParentState}
            preventScrollReset
          >
            {item.title}
          </Link>
        </h2>
      </div>
      <div className={styles.actions}>
        {/* Over the page, keeping its query; closing goes Back. */}
        <Link
          to={{
            pathname: `/watchlist/review/${encodeURIComponent(item.id)}`,
            search: location.search,
          }}
          state={fromParentState}
          preventScrollReset
          className={styles.review}
          aria-label={`Review ${item.title}`}
        >
          <Icon name="star-outline" size={14} className={styles.reviewIcon} />
          Review it
        </Link>
        <IconButton
          variant="outline"
          size="sm"
          label={`Remove ${item.title} from your watchlist`}
          className={styles.remove}
          onClick={onRemove}
        >
          <Icon name="bookmark-minus" size={16} strokeWidth={1.9} />
        </IconButton>
      </div>
    </article>
  )
}
