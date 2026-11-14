import { Button } from '../../ui/Button/Button'
import styles from './SaveError.module.css'

interface SaveErrorProps {
  message: string
  /** Saving again is under way. */
  retrying: boolean
  onRetry: () => void
}

/** A failed save that isn't about one field, with "Try again". */
export function SaveError({ message, retrying, onRetry }: SaveErrorProps) {
  return (
    <div className={styles.root}>
      <p role="alert">{message}</p>
      <Button variant="secondary" size="sm" busy={retrying} onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
