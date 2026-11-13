import { useEffect, useRef } from 'react'
import type { SearchResult } from '../../api/types'
import { categoryVars } from '../../lib/categories'
import { TextArea } from '../../ui/TextArea/TextArea'
import { SaveError } from './SaveError'
import { SelectedItem } from './SelectedItem'
import styles from './WriteStep.module.css'

// As the backend's limit. review-detail has its own: features don't share.
export const TEXT_MAX_LENGTH = 5000

interface WriteStepProps {
  /** For the save button in the sheet's footer, which sits outside the form. */
  id: string
  item: SearchResult
  /** The category's rating name, such as "IMDb". Null while unknown. */
  ratingLabel: string | null
  rating: number
  text: string
  /** The server's message about the text. */
  error?: string
  formError: string | null
  /** Saving again is under way. */
  retrying: boolean
  onChangeItem: () => void
  onTextChange: (text: string) => void
  onRetry: () => void
  onSubmit: () => void
}

/** The add sheet's third step, from boards 05 and 22; 09 and 26 on a phone. */
export function WriteStep({
  id,
  item,
  ratingLabel,
  rating,
  text,
  error,
  formError,
  retrying,
  onChangeItem,
  onTextChange,
  onRetry,
  onSubmit,
}: WriteStepProps) {
  // Writing starts in the text. On a phone, that opens the keyboard.
  const textRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    textRef.current?.focus()
  }, [])

  return (
    <form
      id={id}
      className={styles.root}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <SelectedItem
        item={item}
        ratingLabel={ratingLabel}
        rating={rating}
        onChange={onChangeItem}
      />
      <div className={styles.field}>
        <TextArea
          ref={textRef}
          label="In a line or two"
          placeholder="e.g. “Way more fun than it had any right to be.”"
          value={text}
          counterMax={TEXT_MAX_LENGTH}
          rows={3}
          error={error}
          onChange={(event) => onTextChange(event.target.value)}
        />
        {/* Beside the label. A phone shows it on the card instead, so CSS
            hides one of the two. */}
        <span className={styles.rating} style={categoryVars(item.category)}>
          Your rating <span className={styles.chip}>{rating.toFixed(1)}</span>
        </span>
      </div>
      {formError && (
        <SaveError message={formError} retrying={retrying} onRetry={onRetry} />
      )}
    </form>
  )
}
