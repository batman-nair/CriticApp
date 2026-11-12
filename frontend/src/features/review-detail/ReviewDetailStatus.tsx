import { Button } from '../../ui/Button/Button'
import { Icon } from '../../ui/Icon/Icon'
import styles from './ReviewDetailStatus.module.css'

interface ReviewDetailStatusProps {
  /** A 404 or an id that isn't one, or any other failure. */
  kind: 'not-found' | 'error'
  /** "Back to the list" when not found, "Try again" on an error. */
  onAction: () => void
}

/** The dialog's body when there's no review to show. */
export function ReviewDetailStatus({
  kind,
  onAction,
}: ReviewDetailStatusProps) {
  if (kind === 'not-found') {
    return (
      <div className={styles.root}>
        <h2 className={styles.title}>Review not found</h2>
        <p className={styles.text}>It may have been deleted.</p>
        <Button size="lg" className={styles.action} onClick={onAction}>
          Back to the list
        </Button>
      </div>
    )
  }

  return (
    <div role="alert" className={styles.root}>
      <h2 className={styles.title}>Couldn’t load this review.</h2>
      <Button size="lg" className={styles.action} onClick={onAction}>
        <Icon name="refresh" size={16} strokeWidth={2.2} />
        Try again
      </Button>
    </div>
  )
}
