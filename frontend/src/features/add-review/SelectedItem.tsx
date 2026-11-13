import type { SearchResult } from '../../api/types'
import { categoryLabel, categoryVars } from '../../lib/categories'
import { formatYears } from '../../lib/format'
import { Button } from '../../ui/Button/Button'
import { Poster } from '../../ui/Poster/Poster'
import { RatingBadge } from '../../ui/RatingBadge/RatingBadge'
import styles from './SelectedItem.module.css'

interface SelectedItemProps {
  item: SearchResult
  /** The category's rating name, such as "IMDb". Null while unknown. */
  ratingLabel: string | null
  /** The rating given so far, shown on a phone (board 09). */
  rating?: number
  onChange: () => void
}

/** The picked title on Rate and Write, from boards 04, 05, 21 and 22. */
export function SelectedItem({
  item,
  ratingLabel,
  rating,
  onChange,
}: SelectedItemProps) {
  const years = formatYears(item.start_year, item.end_year)
  // Null is unknown and [] is none: neither is shown.
  const genres = item.genres?.join(', ')

  return (
    <div className={styles.root} style={categoryVars(item.category)}>
      <Poster
        className={styles.poster}
        src={item.image_url}
        title={item.title}
        category={item.category}
      />
      <div className={styles.body}>
        <p className={styles.title}>
          {item.title}
          {years && (
            <>
              {' '}
              <span className={styles.year}>{years}</span>
            </>
          )}
        </p>
        <p className={styles.meta}>
          <span className={styles.dot} aria-hidden="true" />
          {categoryLabel(item.category)}
          {genres && <span className={styles.genres}> · {genres}</span>}
        </p>
        {(rating !== undefined ||
          (ratingLabel !== null && item.provider_rating !== null)) && (
          <p className={styles.badges}>
            {rating !== undefined && (
              <span className={styles.mine}>
                Your rating {rating.toFixed(1)}
              </span>
            )}
            {ratingLabel !== null && (
              <RatingBadge
                variant="provider"
                provider={ratingLabel}
                rating={item.provider_rating}
                category={item.category}
              />
            )}
          </p>
        )}
      </div>
      <Button
        className={styles.change}
        variant="ghost"
        size="sm"
        onClick={onChange}
      >
        Change
      </Button>
    </div>
  )
}
