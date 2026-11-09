import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../../lib/cx'
import styles from './IconButton.module.css'

type IconButtonProps = Omit<ComponentProps<'button'>, 'aria-label'> & {
  label: string
  children: ReactNode
  variant?: 'ghost' | 'soft' | 'outline'
  size?: 'sm' | 'md'
}

export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={cx(styles.root, styles[variant], styles[size], className)}
    />
  )
}
