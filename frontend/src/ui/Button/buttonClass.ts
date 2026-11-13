import { cx } from '../../lib/cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonClassOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

/** The button look for a non-button element, such as a router link. */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: ButtonClassOptions = {}) {
  return cx(styles.root, styles[variant], styles[size], className)
}
