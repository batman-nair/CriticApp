import type { ComponentProps } from 'react'
import { categoryVars } from '../../lib/categories'
import { cx } from '../../lib/cx'
import styles from './Chip.module.css'

type ChipProps = ComponentProps<'button'> & {
  category?: string
  count?: number
  selected?: boolean
  variant?: 'filter' | 'suggestion'
}

export function Chip({
  category,
  count,
  selected = false,
  variant = 'filter',
  className,
  style,
  type = 'button',
  children,
  ...rest
}: ChipProps) {
  const isFilter = variant === 'filter'
  const isSelected = isFilter && selected

  return (
    <button
      {...rest}
      type={type}
      aria-pressed={isFilter ? selected : undefined}
      style={{ ...(category ? categoryVars(category) : undefined), ...style }}
      className={cx(
        styles.root,
        styles[variant],
        isSelected && styles.selected,
        isSelected && category && styles.tinted,
        className,
      )}
    >
      {isFilter && category && (
        <span className={styles.dot} aria-hidden="true" />
      )}
      <span>
        {!isFilter && '+ '}
        {children}
      </span>
      {/* The space separates the accessible name; flex doesn't render it. */}
      {count !== undefined && (
        <>
          {' '}
          <span className={styles.count}>{count}</span>
        </>
      )}
    </button>
  )
}
