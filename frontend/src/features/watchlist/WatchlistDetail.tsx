import { Fragment, type ReactNode } from 'react'
import type { Item } from '../../api/types'
import { categoryVars, reviewCategory } from '../../lib/categories'
import { formatDate, formatMediaType, formatYears } from '../../lib/format'
import { Description } from '../../ui/Description/Description'
import { Icon } from '../../ui/Icon/Icon'
import { Poster } from '../../ui/Poster/Poster'
import { singularLabel } from './singularLabel'
import styles from './WatchlistDetail.module.css'

interface WatchlistDetailProps {
  item: Item
  /** When it went on the watchlist. Unknown for a title fetched on its own. */
  addedAt?: string
  /**
   * The category's name for the provider's rating, such as "IMDb". Undefined
   * while /categories loads, which leaves the rating out; null when it isn't
   * known, which labels it "Rating".
   */
  ratingLabel: string | null | undefined
  /** Under the facts: Review it. */
  actions?: ReactNode
}

/** A watchlist title's details: the review dialog's layout, without a review. */
export function WatchlistDetail({
  item,
  addedAt,
  ratingLabel,
  actions,
}: WatchlistDetailProps) {
  const category =
    item.category === 'anime'
      ? reviewCategory(item.category, item.details.media_type)
      : item.category
  const years = formatYears(item.start_year, item.end_year)
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
    ['Languages', item.languages.join(', ')],
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
          {singularLabel(category)}
          {years && ` · ${years}`}
        </span>
        <h2 className={styles.title}>{item.title}</h2>
      </div>
      <div className={styles.main}>
        {(providerRating !== null || addedAt) && (
          <dl className={styles.stats}>
            {providerRating !== null && (
              <div className={styles.stat}>
                <dt className={styles.statLabel}>{ratingLabel ?? 'Rating'}</dt>
                <dd className={styles.rating}>
                  <Icon name="star" size={15} className={styles.star} />
                  {providerRating.toFixed(1)}
                </dd>
              </div>
            )}
            {addedAt && (
              <div className={styles.stat}>
                <dt className={styles.statLabel}>Added</dt>
                <dd className={styles.added}>
                  <time dateTime={addedAt}>{formatDate(addedAt)}</time>
                </dd>
              </div>
            )}
          </dl>
        )}
        {actions}
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
