import { Button } from '../ui/Button/Button'
import { Dialog } from '../ui/Dialog/Dialog'
import { useRouteDialog } from '../ui/Dialog/useRouteDialog'
import styles from './DialogErrorPage.module.css'

/**
 * The error boundary for a dialog route: the crash stays in the dialog, and the
 * list, header and footer stay behind it.
 */
export function DialogErrorPage() {
  const dialog = useRouteDialog()

  return (
    <>
      {/* Mounts after the route title, so React places it first and it wins. */}
      <title>Something broke · Critic</title>
      <Dialog {...dialog} size="detail" hideTitle title="Something broke">
        <div role="alert" className={styles.root}>
          <h2 className={styles.title}>Something broke</h2>
          <p className={styles.text}>
            It’s not you. Give it a moment and try again.
          </p>
          <div className={styles.actions}>
            <Button
              variant="primary"
              size="lg"
              className={styles.action}
              onClick={() => window.location.reload()}
            >
              Try again
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className={styles.action}
              onClick={() => dialog.onOpenChange(false)}
            >
              Back to the list
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
