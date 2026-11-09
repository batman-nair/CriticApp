import { useId, type ComponentProps } from 'react'
import { cx } from '../../lib/cx'
import fieldStyles from '../field.module.css'
import styles from './TextArea.module.css'

interface TextAreaProps extends ComponentProps<'textarea'> {
  label: string
  value: string
  error?: string
  counterMax?: number
}

export function TextArea({
  label,
  value,
  error,
  counterMax,
  id: idProp,
  className,
  rows = 3,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: TextAreaProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const errorId = `${id}-error`
  const counterId = `${id}-counter`
  const hasCounter = counterMax !== undefined
  // By code point, as the backend's limit counts; .length counts emoji as two.
  const length = Array.from(value).length

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      <textarea
        {...rest}
        id={id}
        value={value}
        rows={rows}
        className={cx(
          fieldStyles.control,
          styles.control,
          error && fieldStyles.invalid,
          className,
        )}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={
          cx(ariaDescribedBy, hasCounter && counterId, error && errorId) ||
          undefined
        }
      />
      {(error || hasCounter) && (
        <div className={styles.footer}>
          {error && (
            <p id={errorId} className={fieldStyles.error}>
              {error}
            </p>
          )}
          {hasCounter && (
            <span
              id={counterId}
              className={cx(styles.counter, length > counterMax && styles.over)}
            >
              {`${length} / ${counterMax}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
