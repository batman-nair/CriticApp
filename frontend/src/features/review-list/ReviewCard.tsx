import { Link, useLocation } from 'react-router'
import type { Review } from '../../api/types'
import {
  categoryLabel,
  categoryVars,
  reviewCategory,
} from '../../lib/categories'
import { formatYears } from '../../lib/format'
import { fromParentState } from '../../ui/Dialog/useRouteDialog'
import { Poster } from '../../ui/Poster/Poster'
import { RatingBadge } from '../../ui/RatingBadge/RatingBadge'
import styles from './ReviewCard.module.css'

interface ReviewCardProps {
  review: Review
}

export function ReviewCard({ review }: ReviewCardProps) {
  const location = useLocation()
  const { item } = review
  const category =
    item.category === 'anime'
      ? reviewCategory(item.category, item.details.media_type)
      : item.category
  const years = formatYears(item.start_year, item.end_year)
  const text = review.text?.trim()
  const genres = item.genres.slice(0, 3).join(', ')

  return (
    <article className={styles.card} style={categoryVars(category)}>
      <Poster
        className={styles.poster}
        src={item.image_url}
        title={item.title}
        category={category}
      />
      <div className={styles.body}>
        <span className={styles.meta}>
          <span className={styles.dot} aria-hidden="true" />
          {categoryLabel(category)}
          {years && ` · ${years}`}
        </span>
        <h2 className={styles.title}>
          {/* Stretched over the card by ::after, but named by the title alone. */}
          <Link
            className={styles.link}
            to={{ pathname: `/reviews/${review.id}`, search: location.search }}
            state={fromParentState}
            preventScrollReset
          >
            {item.title}
          </Link>
        </h2>
        {text ? (
          <p className={styles.text}>{text}</p>
        ) : (
          <p className={styles.noNotes}>No notes yet</p>
        )}
        <div className={styles.footer}>
          <RatingBadge rating={review.rating} category={category} />
          {genres && <span className={styles.genres}>{genres}</span>}
        </div>
      </div>
    </article>
  )
}
