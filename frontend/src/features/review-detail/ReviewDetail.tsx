import { Fragment } from 'react'
import type { Review } from '../../api/types'
import {
  categoryLabel,
  categoryVars,
  reviewCategory,
} from '../../lib/categories'
import { formatMediaType, formatYears } from '../../lib/format'
import { Icon } from '../../ui/Icon/Icon'
import { Poster } from '../../ui/Poster/Poster'
import { Description } from './Description'
import styles from './ReviewDetail.module.css'

interface ReviewDetailProps {
  review: Review
  /**
   * The category's name for the provider's rating, such as "IMDb". Undefined
   * while /categories loads, which leaves the provider's rating out; null when
   * it isn't known, which labels it "Rating".
   */
  ratingLabel: string | null | undefined
}

export function ReviewDetail({ review, ratingLabel }: ReviewDetailProps) {
  const { item } = review
  const category =
    item.category === 'anime'
      ? reviewCategory(item.category, item.details.media_type)
      : item.category
  const years = formatYears(item.start_year, item.end_year)
  const text = review.text?.trim()
  const description = item.description?.trim()
  // Left out until /categories says what to call it.
  const providerRating = ratingLabel === undefined ? null : item.provider_rating

  const about = [
    ['Genres', item.genres.join(', ')],
    // Joined as given, so "Square Enix Co., Ltd." reads back whole.
    ['By', item.creators.join(', ')],
    [
      'Type',
      'media_type' in item.details
        ? formatMediaType(item.details.media_type)
        : '',
    ],
  ].filter(([, value]) => value)

  return (
    <article className={styles.root} style={categoryVars(category)}>
      <Poster
        className={styles.poster}
        src={item.image_url}
        title={item.title}
        category={category}
      />
      <div className={styles.head}>
        <span className={styles.meta}>
          <span className={styles.dot} aria-hidden="true" />
          {categoryLabel(category)}
          {years && ` · ${years}`}
        </span>
        <h2 className={styles.title}>{item.title}</h2>
      </div>
      <div className={styles.main}>
        <dl className={styles.ratings}>
          <div className={styles.mine}>
            <dt className={styles.ratingLabel}>My rating</dt>
            <dd className={styles.score}>
              {review.rating.toFixed(1)}
              <span className={styles.scale}>/10</span>
            </dd>
          </div>
          {providerRating !== null && (
            <div className={styles.provider}>
              <dt className={styles.ratingLabel}>{ratingLabel ?? 'Rating'}</dt>
              <dd className={styles.providerScore}>
                <Icon name="star" size={15} className={styles.star} />
                {providerRating.toFixed(1)}
              </dd>
            </div>
          )}
        </dl>
        {text ? (
          <p className={styles.quote}>“{text}”</p>
        ) : (
          <p className={styles.noNotes}>No notes yet</p>
        )}
        {(about.length > 0 || description) && (
          <>
            <hr className={styles.divider} />
            <div className={styles.about}>
              <h3 className={styles.aboutTitle}>About</h3>
              {about.length > 0 && (
                <dl className={styles.facts}>
                  {about.map(([key, value]) => (
                    <Fragment key={key}>
                      <dt className={styles.factKey}>{key}</dt>
                      <dd>{value}</dd>
                    </Fragment>
                  ))}
                </dl>
              )}
              {description && <Description text={description} />}
            </div>
          </>
        )}
      </div>
    </article>
  )
}
