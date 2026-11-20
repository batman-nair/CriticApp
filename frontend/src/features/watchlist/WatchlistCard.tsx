import { useId } from 'react'
import type { WatchlistEntry } from '../../api/types'
import { categoryVars, reviewCategory } from '../../lib/categories'
import { formatYears } from '../../lib/format'
import { Poster } from '../../ui/Poster/Poster'
import styles from './WatchlistCard.module.css'

// One title, so singular, unlike the chips' categoryLabel.
const SINGULAR_LABELS = new Map([
  ['movie', 'Movie'],
  ['series', 'Series'],
  ['game', 'Game'],
  ['anime:series', 'Anime series'],
  ['anime:movie', 'Anime movie'],
  ['manga', 'Manga'],
  ['book', 'Book'],
])

interface WatchlistCardProps {
  entry: WatchlistEntry
  /** Just added in the add sheet: outlined until the sheet opens again. */
  fresh?: boolean
}

export function WatchlistCard({ entry, fresh = false }: WatchlistCardProps) {
  const titleId = useId()
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
          {SINGULAR_LABELS.get(category) ?? category}
          {years && ` · ${years}`}
        </span>
        <h2 id={titleId} className={styles.title}>
          {item.title}
        </h2>
      </div>
    </article>
  )
}
