import { useId, type ComponentProps } from 'react'
import { cx } from '../../lib/cx'
import fieldStyles from '../field.module.css'
import styles from './TextField.module.css'

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'size'> {
  label: string
  error?: string
  /** `lg` is the login page's field: 16px text, so iOS Safari doesn't zoom. */
  size?: 'md' | 'lg'
}

export function TextField({
  label,
  error,
  size = 'md',
  id: idProp,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: TextFieldProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const errorId = `${id}-error`

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      <input
        {...rest}
        id={id}
        className={cx(
          fieldStyles.control,
          styles.control,
          styles[size],
          error && fieldStyles.invalid,
          className,
        )}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={cx(ariaDescribedBy, error && errorId) || undefined}
      />
      {error && (
        <p id={errorId} className={fieldStyles.error}>
          {error}
        </p>
      )}
    </div>
  )
}
