import { cx } from '../../lib/cx'
import { Icon } from '../../ui/Icon/Icon'
import styles from './WatchlistEmpty.module.css'

/** Nothing is on the watchlist. */
export function WatchlistEmpty() {
  return (
    <div className={styles.empty}>
      <div className={styles.art} aria-hidden="true">
        <span className={cx(styles.tile, styles.left)} />
        <span className={cx(styles.tile, styles.right)} />
        <span className={styles.front}>
          <Icon
            name="bookmark-plus"
            strokeWidth={1.8}
            className={styles.icon}
          />
        </span>
      </div>
      <h2 className={styles.title}>Nothing on your watchlist yet</h2>
      <p className={styles.text}>
        Save the things you mean to watch, play or read. They’ll wait here until
        you get to them.
      </p>
    </div>
  )
}
