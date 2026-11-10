import {
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
} from 'react'
import { cx } from '../../lib/cx'
import { Chip } from '../Chip/Chip'
import fieldStyles from '../field.module.css'
import styles from './TagInput.module.css'
import { normaliseTags, parseTags, validateTags } from './tags'

type TagInputProps = Omit<
  ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> & {
  label: string
  value: string[]
  onValueChange: (tags: string[]) => void
  suggestions?: string[]
  error?: string
  optional?: boolean
  layout?: 'stacked' | 'inline'
}

export function TagInput({
  label,
  value,
  onValueChange,
  suggestions = [],
  error,
  optional = false,
  layout = 'stacked',
  id: idProp,
  className,
  disabled,
  placeholder = 'e.g. sci-fi, favourite',
  autoComplete = 'off',
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ref,
  ...rest
}: TagInputProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const errorId = `${id}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, [])

  // The draft keeps what's typed, like a trailing ", ", while it still means
  // the current value. Any other value, from a suggestion or a form reset,
  // replaces it here, without an effect.
  const [draft, setDraft] = useState('')
  const list = normaliseTags(value)
  const key = list.join(',')
  const text = parseTags(draft).join(',') === key ? draft : value.join(', ')

  const used = new Set(list.map((tag) => tag.toLowerCase()))
  const visibleSuggestions = normaliseTags(suggestions).filter(
    (tag) => !used.has(tag.toLowerCase()),
  )

  // Client rules first: a server message is stale once the text breaks a rule.
  const shownError = validateTags(list) || error

  function handleTextChange(raw: string) {
    setDraft(raw)
    const next = parseTags(raw)
    // Typing only a separator isn't a change, so a form doesn't look dirty.
    if (next.join(',') !== key) {
      onValueChange(next)
    }
  }

  function addSuggestion(tag: string, event: MouseEvent<HTMLButtonElement>) {
    // The chip is about to disappear, which would drop keyboard focus. Not for
    // pointers: focusing the input would open the phone keyboard on one tap.
    if (event.detail === 0) {
      const chip = event.currentTarget
      const neighbour = chip.nextElementSibling ?? chip.previousElementSibling
      const target =
        neighbour instanceof HTMLElement ? neighbour : inputRef.current
      target?.focus()
    }
    onValueChange([...list, tag])
  }

  return (
    <div className={cx(fieldStyles.field, styles.root, styles[layout])}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
        {optional && (
          <>
            {' '}
            <span className={styles.optional}>(optional)</span>
          </>
        )}
      </label>
      <div className={styles.row}>
        <input
          {...rest}
          ref={inputRef}
          id={id}
          type="text"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={cx(
            fieldStyles.control,
            styles.control,
            shownError && fieldStyles.invalid,
            className,
          )}
          aria-invalid={shownError ? true : ariaInvalid}
          aria-describedby={
            cx(ariaDescribedBy, shownError && errorId) || undefined
          }
          onChange={(event) => handleTextChange(event.target.value)}
        />
        {visibleSuggestions.length > 0 && (
          <div className={styles.suggestions}>
            {visibleSuggestions.map((tag) => (
              <Chip
                key={tag}
                variant="suggestion"
                className={styles.suggestion}
                disabled={disabled}
                onClick={(event) => addSuggestion(tag, event)}
              >
                {tag}
              </Chip>
            ))}
          </div>
        )}
      </div>
      {shownError && (
        <p id={errorId} className={fieldStyles.error}>
          {shownError}
        </p>
      )}
    </div>
  )
}
