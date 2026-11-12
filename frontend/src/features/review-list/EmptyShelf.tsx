import { Link } from 'react-router'
import { useAddReviewLink } from '../../auth/useAddReviewLink'
import { categoryVars } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { buttonClass } from '../../ui/Button/buttonClass'
import { Icon } from '../../ui/Icon/Icon'
import styles from './EmptyShelf.module.css'

export function EmptyShelf() {
  const addLink = useAddReviewLink()

  return (
    <div className={styles.shelf}>
      <div className={styles.art} aria-hidden="true">
        <span
          className={cx(styles.tile, styles.book)}
          style={categoryVars('book')}
        />
        <span
          className={cx(styles.tile, styles.movie)}
          style={categoryVars('movie')}
        />
        <span
          className={cx(styles.tile, styles.game)}
          style={categoryVars('game')}
        >
          <Icon name="plus" size={30} className={styles.plus} />
        </span>
      </div>
      <h2 className={styles.title}>Your shelf is empty</h2>
      <p className={styles.text}>
        Add the first thing you’ve watched, played or read — it’ll show up here.
      </p>
      {addLink !== null && (
        <Link
          to={addLink}
          preventScrollReset
          className={buttonClass({
            variant: 'primary',
            size: 'lg',
            className: styles.add,
          })}
        >
          <Icon
            name="plus"
            size={17}
            strokeWidth={2.2}
            className={styles.addIcon}
          />
          Add your first review
        </Link>
      )}
    </div>
  )
}
