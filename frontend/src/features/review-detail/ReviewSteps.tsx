import { Icon } from '../../ui/Icon/Icon'
import { IconButton } from '../../ui/IconButton/IconButton'
import styles from './ReviewSteps.module.css'
import type { ReviewSteps as ReviewStepsProps } from './useReviewSteps'

/**
 * ‹ › in the dialog's header. At the ends they're aria-disabled rather than
 * disabled, so a focused one keeps the focus inside the dialog.
 */
export function ReviewSteps({
  previous,
  next,
  canGoPrevious,
  canGoNext,
  isLoadingNext,
  goPrevious,
  goNext,
}: ReviewStepsProps) {
  return (
    <div className={styles.root}>
      <IconButton
        label={
          previous
            ? `Previous review: ${previous.item.title}`
            : 'Previous review'
        }
        variant="soft"
        size="sm"
        className={styles.button}
        aria-disabled={!canGoPrevious || undefined}
        onClick={goPrevious}
      >
        <Icon name="chevron-left" />
      </IconButton>
      <IconButton
        label={next ? `Next review: ${next.item.title}` : 'Next review'}
        variant="soft"
        size="sm"
        className={styles.button}
        aria-disabled={!canGoNext || undefined}
        aria-busy={isLoadingNext || undefined}
        onClick={goNext}
      >
        <Icon name="chevron-right" />
      </IconButton>
    </div>
  )
}
