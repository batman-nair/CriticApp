import { Button } from '../../ui/Button/Button'
import { Icon } from '../../ui/Icon/Icon'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { VisuallyHidden } from '../../ui/VisuallyHidden/VisuallyHidden'
import styles from './WatchlistDetailStatus.module.css'

type WatchlistDetailStatusProps =
  | { kind: 'loading' }
  | {
      kind: 'not-found' | 'error'
      /** "Back to the watchlist" when not found, "Try again" on an error. */
      onAction: () => void
    }

/** The details dialog's body when there's no title to show yet. */
export function WatchlistDetailStatus(props: WatchlistDetailStatusProps) {
  if (props.kind === 'loading') {
    return (
      <div aria-busy="true">
        <div role="status">
          <VisuallyHidden>Loading the title</VisuallyHidden>
        </div>
        <div className={styles.skeleton} aria-hidden="true">
          <Skeleton className={styles.poster} aspectRatio="2 / 3" />
          <div className={styles.lines}>
            <Skeleton width="38%" height={13} radius={6} />
            <Skeleton className={styles.titleLine} width="72%" />
            <Skeleton width="64%" height={14} radius={6} />
            <Skeleton width="48%" height={14} radius={6} />
          </div>
        </div>
      </div>
    )
  }

  const { kind, onAction } = props
  if (kind === 'not-found') {
    return (
      <div className={styles.root}>
        <h2 className={styles.title}>Title not found</h2>
        <p className={styles.text}>It may have been removed.</p>
        <Button size="lg" className={styles.action} onClick={onAction}>
          Back to the watchlist
        </Button>
      </div>
    )
  }

  return (
    <div role="alert" className={styles.root}>
      <h2 className={styles.title}>Couldn’t load this title.</h2>
      <Button size="lg" className={styles.action} onClick={onAction}>
        <Icon name="refresh" size={16} strokeWidth={2.2} />
        Try again
      </Button>
    </div>
  )
}
