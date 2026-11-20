import { Button } from '../../ui/Button/Button'
import { Icon } from '../../ui/Icon/Icon'
import styles from './WatchlistLoadError.module.css'

interface WatchlistLoadErrorProps {
  onRetry: () => void
}

export function WatchlistLoadError({ onRetry }: WatchlistLoadErrorProps) {
  return (
    <div role="alert" className={styles.error}>
      <span className={styles.icon}>
        <Icon name="cloud-off" size={28} strokeWidth={1.8} />
      </span>
      <h2 className={styles.title}>Couldn’t load your watchlist</h2>
      <p className={styles.text}>
        Something went wrong on the way. Check your connection and try again.
      </p>
      <Button size="lg" className={styles.retry} onClick={onRetry}>
        <Icon name="refresh" size={16} strokeWidth={2.2} />
        Try again
      </Button>
    </div>
  )
}
