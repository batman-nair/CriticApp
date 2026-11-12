import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { VisuallyHidden } from '../../ui/VisuallyHidden/VisuallyHidden'
import styles from './ReviewDetailSkeleton.module.css'

/** The review's layout, from boards 12 and 15, while it loads. */
export function ReviewDetailSkeleton() {
  return (
    <div aria-busy="true">
      <div role="status">
        <VisuallyHidden>Loading the review</VisuallyHidden>
      </div>
      <div className={styles.root} aria-hidden="true">
        <Skeleton className={styles.poster} aspectRatio="2 / 3" />
        <div className={styles.head}>
          <Skeleton width="38%" height={13} radius={6} />
          <Skeleton className={styles.title} width="72%" />
        </div>
        <div className={styles.main}>
          <div className={styles.ratings}>
            <Skeleton className={styles.box} />
            <Skeleton className={styles.box} />
          </div>
          <div className={styles.lines}>
            <Skeleton width="92%" height={18} radius={6} />
            <Skeleton width="56%" height={18} radius={6} />
          </div>
          <div className={styles.lines}>
            <Skeleton width="20%" height={12} radius={6} />
            <Skeleton width="64%" height={14} radius={6} />
            <Skeleton width="48%" height={14} radius={6} />
            <Skeleton width="88%" height={14} radius={6} />
          </div>
        </div>
      </div>
    </div>
  )
}
