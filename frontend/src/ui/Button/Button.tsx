import type { ComponentProps, MouseEvent } from 'react'
import styles from './Button.module.css'
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass'

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  busy?: boolean
}

export function Button({
  variant,
  size,
  busy = false,
  className,
  type = 'button',
  onClick,
  children,
  ...rest
}: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (busy) {
      // Blocked here rather than with native disabled, which would lose focus mid-save.
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <button
      {...rest}
      {...(busy && { 'aria-busy': true, 'aria-disabled': true })}
      type={type}
      className={buttonClass({ variant, size, className })}
      onClick={handleClick}
    >
      <span className={styles.label}>{children}</span>
      {busy && <span className={styles.spinner} aria-hidden="true" />}
    </button>
  )
}
