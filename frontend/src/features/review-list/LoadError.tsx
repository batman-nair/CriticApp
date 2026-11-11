import { ApiError } from '../../api/client'
import { Button } from '../../ui/Button/Button'
import { Icon } from '../../ui/Icon/Icon'
import styles from './LoadError.module.css'

interface LoadErrorProps {
  error: unknown
  onRetry: () => void
}

export function LoadError({ error, onRetry }: LoadErrorProps) {
  // A network error has no status worth showing.
  const status =
    error instanceof ApiError && error.status > 0 ? error.status : null

  return (
    <div role="alert" className={styles.error}>
      <span className={styles.icon}>
        <Icon name="cloud-off" size={28} strokeWidth={1.8} />
      </span>
      <h2 className={styles.title}>Couldn’t load your reviews</h2>
      <p className={styles.text}>
        Something went wrong on the way. Check your connection and try again.
      </p>
      <Button size="lg" className={styles.retry} onClick={onRetry}>
        <Icon
          name="refresh"
          size={16}
          strokeWidth={2.2}
          className={styles.retryIcon}
        />
        Try again
      </Button>
      {status !== null && <span className={styles.status}>Error {status}</span>}
    </div>
  )
}
