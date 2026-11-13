import { useId, type Ref } from 'react'
import { Button } from '../../ui/Button/Button'
import styles from './DeleteConfirm.module.css'

interface DeleteConfirmProps {
  title: string
  /** The delete is under way. */
  busy: boolean
  /** The last delete failed. */
  failed: boolean
  onKeep: () => void
  onDelete: () => void
  /** For focus on "Keep it", the safe choice, once the banner shows. */
  keepRef?: Ref<HTMLButtonElement>
}

/**
 * Asks before a review is deleted, in the dialog's footer (boards 13 and 16).
 */
export function DeleteConfirm({
  title,
  busy,
  failed,
  onKeep,
  onDelete,
  keepRef,
}: DeleteConfirmProps) {
  const headingId = useId()

  return (
    <div role="group" aria-labelledby={headingId} className={styles.root}>
      <div className={styles.text}>
        <h2 id={headingId} className={styles.title}>
          Delete your review of {title}?
        </h2>
        <p className={styles.note}>Your rating and notes will be removed.</p>
        {failed && (
          <p role="alert" className={styles.error}>
            Couldn’t delete. Try again.
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <Button
          ref={keepRef}
          variant="secondary"
          className={styles.keep}
          onClick={onKeep}
        >
          Keep it
        </Button>
        <Button
          variant="danger"
          className={styles.action}
          busy={busy}
          onClick={onDelete}
        >
          Delete review
        </Button>
      </div>
    </div>
  )
}
