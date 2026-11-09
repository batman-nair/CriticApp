import { useId, type ComponentProps } from 'react'
import { cx } from '../../lib/cx'
import fieldStyles from '../field.module.css'
import styles from './TextField.module.css'

interface TextFieldProps extends ComponentProps<'input'> {
  label: string
  error?: string
}

export function TextField({
  label,
  error,
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
        className={cx(styles.control, error && styles.invalid, className)}
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
