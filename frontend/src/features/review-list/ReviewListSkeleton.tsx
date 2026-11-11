import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { VisuallyHidden } from '../../ui/VisuallyHidden/VisuallyHidden'
import grid from './grid.module.css'
import styles from './ReviewListSkeleton.module.css'

// From the S5 board: two line widths per card, staggered.
const CARDS = [
  { w1: '64%', w2: '58%' },
  { w1: '48%', w2: '70%' },
  { w1: '72%', w2: '40%' },
  { w1: '55%', w2: '62%' },
  { w1: '68%', w2: '46%' },
  { w1: '50%', w2: '66%' },
].map((widths, i) => ({ ...widths, delay: Number((i * 0.12).toFixed(2)) }))

export function ReviewListSkeleton() {
  return (
    <div aria-busy="true">
      <div role="status">
        <VisuallyHidden>Loading your reviews</VisuallyHidden>
      </div>
      <div className={grid.grid} aria-hidden="true">
        {CARDS.map(({ w1, w2, delay }, i) => (
          <div key={i} className={styles.card}>
            <Skeleton
              className={styles.poster}
              aspectRatio="2 / 3"
              delay={delay}
            />
            <div className={styles.lines}>
              <Skeleton width="38%" height={12} radius={6} delay={delay} />
              <Skeleton width={w1} height={22} radius={8} delay={delay} />
              <Skeleton width="92%" height={13} radius={6} delay={delay} />
              <Skeleton width={w2} height={13} radius={6} delay={delay} />
              <Skeleton
                className={styles.badge}
                width={64}
                height={28}
                radius={8}
                delay={delay}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
