import { Link } from 'react-router'
import { buttonClass } from '../ui/Button/buttonClass'
import { Icon } from '../ui/Icon/Icon'
import styles from './Header.module.css'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  return (
    <header className={styles.header}>
      <Link to="/" className={styles.logo}>
        <span className={styles.tile} aria-hidden="true">
          c
        </span>
        Critic
      </Link>
      <div className={styles.actions}>
        <ThemeToggle />
        <Link
          to="/add"
          preventScrollReset
          className={buttonClass({
            variant: 'primary',
            size: 'md',
            className: styles.add,
          })}
        >
          <span className={styles.addLabel}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            <span>
              Add <span className={styles.addSuffix}>review</span>
            </span>
          </span>
        </Link>
        <Link to="/login" className={styles.login}>
          Log in
        </Link>
      </div>
    </header>
  )
}
