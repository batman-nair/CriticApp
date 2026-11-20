import type { SearchResult } from '../../api/types'
import { categoryVars } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { formatYears } from '../../lib/format'
import { Icon } from '../../ui/Icon/Icon'
import { Poster } from '../../ui/Poster/Poster'
import { RatingBadge } from '../../ui/RatingBadge/RatingBadge'
import styles from './SearchResultRow.module.css'

/** A result's state in the add-to-watchlist sheet. */
export interface WatchlistRowStatus {
  /** Only `add` can be tapped. */
  status: 'add' | 'on' | 'reviewed'
  /** Added in this sheet, so the row is tinted. */
  fresh: boolean
}

interface SearchResultRowProps {
  result: SearchResult
  /** The category's rating name, such as "IMDb". Null while unknown. */
  ratingLabel: string | null
  /** The add-to-watchlist sheet's row: an Add / On watchlist / Reviewed end. */
  watchlist?: WatchlistRowStatus
  onSelect: (result: SearchResult) => void
}

/** One search result, from boards 03, 07, 20 and 24. */
export function SearchResultRow({
  result,
  ratingLabel,
  watchlist,
  onSelect,
}: SearchResultRowProps) {
  const years = formatYears(result.start_year, result.end_year)
  // Null is unknown and [] is none: neither has a line.
  const genres = result.genres?.join(', ')

  const poster = (
    <Poster
      className={styles.poster}
      src={result.image_url}
      title={result.title}
      category={result.category}
    />
  )
  const text = (
    <>
      <span className={styles.title}>
        {result.title}
        {years && (
          <>
            {' '}
            <span className={styles.year}>{years}</span>
          </>
        )}
      </span>
      {genres && <span className={styles.genres}>{genres}</span>}
    </>
  )

  if (watchlist) {
    const { status, fresh } = watchlist
    const named = years ? `${result.title} (${years})` : result.title
    const rating = result.my_review?.rating.toFixed(1)
    let label
    let end
    if (status === 'add') {
      label = `Add ${named} to your watchlist`
      end = (
        <span className={styles.add} aria-hidden="true">
          <Icon name="plus" size={14} strokeWidth={2.4} />
          <span className={styles.addLabel}>Add</span>
        </span>
      )
    } else if (status === 'on') {
      label = `${named} is on your watchlist`
      end = (
        <span className={styles.on}>
          <Icon name="bookmark" size={14} />
          <span>
            On <span className={styles.onSecond}>watchlist</span>
          </span>
        </span>
      )
    } else {
      label = `${named}: already reviewed${rating ? `, ${rating}` : ''}`
      end = (
        <span className={styles.reviewed}>
          <Icon name="check" size={12} strokeWidth={2.8} />
          {rating ? `Reviewed · ${rating}` : 'Reviewed'}
        </span>
      )
    }

    return (
      <li>
        <button
          type="button"
          className={cx(styles.row, styles.watchlist)}
          style={categoryVars(result.category)}
          aria-label={label}
          aria-disabled={status !== 'add' || undefined}
          data-status={status}
          data-fresh={fresh || undefined}
          onClick={() => {
            if (status === 'add') onSelect(result)
          }}
        >
          {poster}
          {text}
          <span className={styles.status}>{end}</span>
        </button>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        className={styles.row}
        onClick={() => onSelect(result)}
      >
        {poster}
        {text}
        {result.my_review && (
          <span className={styles.mine}>
            <Icon name="check" size={12} strokeWidth={2.8} />
            Reviewed · {result.my_review.rating.toFixed(1)}
          </span>
        )}
        {ratingLabel !== null && result.provider_rating !== null && (
          <span className={styles.provider}>
            <RatingBadge
              variant="provider"
              provider={ratingLabel}
              rating={result.provider_rating}
              category={result.category}
            />
          </span>
        )}
        <Icon
          className={styles.chevron}
          name="chevron-right"
          size={18}
          strokeWidth={2}
        />
      </button>
    </li>
  )
}
