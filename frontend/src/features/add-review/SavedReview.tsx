import { Link, useLocation } from 'react-router'
import type { Review } from '../../api/types'
import {
  categoryLabel,
  categoryVars,
  reviewCategory,
} from '../../lib/categories'
import { formatYears } from '../../lib/format'
import { Poster } from '../../ui/Poster/Poster'
import { RatingBadge } from '../../ui/RatingBadge/RatingBadge'
import styles from './SavedReview.module.css'

interface SavedReviewProps {
  review: Review
  /** The category's rating name, such as "IMDb". Null while unknown. */
  ratingLabel: string | null
}

/** The review as saved, from boards 06, 10, 23 and 27. */
export function SavedReview({ review, ratingLabel }: SavedReviewProps) {
  const location = useLocation()
  const { item } = review
  const category =
    item.category === 'anime'
      ? reviewCategory(item.category, item.details.media_type)
      : item.category
  const years = formatYears(item.start_year, item.end_year)
  const text = review.text?.trim()

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
        <h3 className={styles.title}>
          {/*
           * Stretched over the card by ::after. Replaces /add, with its query
           * and state, so closing the review returns where closing the sheet
           * would have.
           */}
          <Link
            className={styles.link}
            to={{ pathname: `/reviews/${review.id}`, search: location.search }}
            state={location.state}
            replace
          >
            {item.title}
          </Link>
        </h3>
        {text ? (
          <p className={styles.text}>{text}</p>
        ) : (
          <p className={styles.noNotes}>No notes yet</p>
        )}
        <div className={styles.footer}>
          <RatingBadge rating={review.rating} category={category} />
          {ratingLabel !== null && item.provider_rating !== null && (
            <span className={styles.provider}>
              {ratingLabel} {item.provider_rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
