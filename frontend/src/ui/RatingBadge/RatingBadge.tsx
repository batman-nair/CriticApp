import { categoryVars } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { Icon } from '../Icon/Icon'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './RatingBadge.module.css'

interface BaseProps {
  rating: number | null
  category: string
}

type RatingBadgeProps =
  | (BaseProps & { variant?: undefined })
  | (BaseProps & { variant: 'provider'; provider: string })

export function RatingBadge(props: RatingBadgeProps) {
  const { rating, category } = props

  if (props.variant === 'provider') {
    if (rating === null) return null
    return (
      <span
        className={cx(styles.root, styles.provider)}
        style={categoryVars(category)}
      >
        <Icon name="star" size={12} />
        {props.provider} {rating.toFixed(1)}
      </span>
    )
  }

  if (rating === null) {
    return (
      <span
        className={cx(styles.root, styles.score, styles.unrated)}
        style={categoryVars(category)}
      >
        <span aria-hidden="true">–.–</span>{' '}
        <span className={styles.scale} aria-hidden="true">
          /10
        </span>
        <VisuallyHidden>Not rated</VisuallyHidden>
      </span>
    )
  }

  return (
    <span
      className={cx(styles.root, styles.score)}
      style={categoryVars(category)}
    >
      <span>{rating.toFixed(1)}</span>
      {/* The space separates the text; flex doesn't render it. */}{' '}
      <span className={styles.scale}>/10</span>
    </span>
  )
}
