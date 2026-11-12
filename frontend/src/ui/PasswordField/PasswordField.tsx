import { useId, useState, type ComponentProps } from 'react'
import { cx } from '../../lib/cx'
import fieldStyles from '../field.module.css'
import styles from './PasswordField.module.css'

interface PasswordFieldProps extends Omit<
  ComponentProps<'input'>,
  'type' | 'size'
> {
  label: string
  error?: string
}

/**
 * A password input with a Show/Hide toggle. Always the large field: 16px
 * text, so iOS Safari doesn't zoom.
 */
export function PasswordField({
  label,
  error,
  id: idProp,
  className,
  disabled,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: PasswordFieldProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const errorId = `${id}-error`
  const [shown, setShown] = useState(false)

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      {/* The border is on the wrapper, around the input and the toggle. */}
      <div
        className={cx(
          styles.box,
          error && styles.invalid,
          disabled && styles.disabled,
          className,
        )}
      >
        <input
          {...rest}
          id={id}
          type={shown ? 'text' : 'password'}
          className={styles.input}
          disabled={disabled}
          aria-invalid={error ? true : ariaInvalid}
          aria-describedby={cx(ariaDescribedBy, error && errorId) || undefined}
        />
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={shown}
          aria-controls={id}
          disabled={disabled}
          onClick={() => setShown(!shown)}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && (
        <p id={errorId} className={fieldStyles.error}>
          {error}
        </p>
      )}
    </div>
  )
}
