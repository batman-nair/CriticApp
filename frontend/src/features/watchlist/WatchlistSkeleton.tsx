import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { VisuallyHidden } from '../../ui/VisuallyHidden/VisuallyHidden'
import grid from './grid.module.css'
import styles from './WatchlistSkeleton.module.css'

// From the loading board: the title line's width cycles, staggered.
const TITLE_WIDTHS = ['80%', '64%', '72%', '58%', '76%']
const CARDS = Array.from({ length: 10 }, (_, i) => ({
  titleWidth: TITLE_WIDTHS[i % TITLE_WIDTHS.length],
  delay: Number((i * 0.08).toFixed(2)),
}))

export function WatchlistSkeleton() {
  return (
    <div aria-busy="true" className={styles.root}>
      <div role="status">
        <VisuallyHidden>Loading your watchlist</VisuallyHidden>
      </div>
      <div className={grid.grid} aria-hidden="true">
        {CARDS.map(({ titleWidth, delay }, i) => (
          <div key={i} className={styles.card}>
            <Skeleton
              className={styles.poster}
              aspectRatio="2 / 3"
              delay={delay}
            />
            <Skeleton className={styles.meta} width="50%" delay={delay} />
            <Skeleton
              className={styles.title}
              width={titleWidth}
              delay={delay}
            />
            <Skeleton className={styles.action} width="100%" delay={delay} />
          </div>
        ))}
      </div>
    </div>
  )
}
