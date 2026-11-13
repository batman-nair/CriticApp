import type { SearchResult } from '../../api/types'
import { formatYears } from '../../lib/format'
import { Icon } from '../../ui/Icon/Icon'
import { Poster } from '../../ui/Poster/Poster'
import { RatingBadge } from '../../ui/RatingBadge/RatingBadge'
import styles from './SearchResultRow.module.css'

interface SearchResultRowProps {
  result: SearchResult
  /** The category's rating name, such as "IMDb". Null while unknown. */
  ratingLabel: string | null
  onSelect: (result: SearchResult) => void
}

/** One search result, from boards 03, 07, 20 and 24. */
export function SearchResultRow({
  result,
  ratingLabel,
  onSelect,
}: SearchResultRowProps) {
  const years = formatYears(result.start_year, result.end_year)
  // Null is unknown and [] is none: neither has a line.
  const genres = result.genres?.join(', ')

  return (
    <li>
      <button
        type="button"
        className={styles.row}
        onClick={() => onSelect(result)}
      >
        <Poster
          className={styles.poster}
          src={result.image_url}
          title={result.title}
          category={result.category}
        />
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
