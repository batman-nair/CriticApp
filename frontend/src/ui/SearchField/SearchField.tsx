import { useId, useImperativeHandle, useRef, type ComponentProps } from 'react'
import { cx } from '../../lib/cx'
import { Icon } from '../Icon/Icon'
import { IconButton } from '../IconButton/IconButton'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './SearchField.module.css'

type SearchFieldProps = Omit<
  ComponentProps<'input'>,
  'onChange' | 'value' | 'type'
> & {
  label: string
  value: string
  onValueChange: (value: string) => void
  tone?: 'panel' | 'sheet'
  clearLabel?: string
}

export function SearchField({
  label,
  value,
  onValueChange,
  tone = 'panel',
  clearLabel = 'Clear search',
  id: idProp,
  className,
  disabled,
  autoComplete = 'off',
  ref,
  ...rest
}: SearchFieldProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, [])

  function clear() {
    onValueChange('')
    // The button is about to disappear, which would otherwise drop focus.
    inputRef.current?.focus()
  }

  return (
    <div className={cx(styles.root, styles[tone], className)}>
      <VisuallyHidden>
        <label htmlFor={id}>{label}</label>
      </VisuallyHidden>
      <Icon name="search" size={tone === 'panel' ? 21 : 18} strokeWidth={1.9} />
      <input
        {...rest}
        ref={inputRef}
        id={id}
        type="search"
        className={styles.input}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value !== '' && (
        <IconButton
          variant="soft"
          label={clearLabel}
          disabled={disabled}
          onClick={clear}
        >
          <Icon name="x" size={16} />
        </IconButton>
      )}
    </div>
  )
}
