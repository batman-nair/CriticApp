import { useId, useState } from 'react'
import { cx } from '../../lib/cx'
import { Icon } from '../../ui/Icon/Icon'
import styles from './Description.module.css'

/**
 * Longer than this, the text is clamped with a More button. One threshold for
 * every width: the boards' 200 for desktops would clip a 170-character text on
 * a phone with no way to open it.
 */
const CLAMP_AFTER = 160

interface DescriptionProps {
  text: string
}

export function Description({ text }: DescriptionProps) {
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const clampable = text.length > CLAMP_AFTER

  return (
    <div className={styles.root}>
      <p
        id={id}
        className={cx(styles.text, clampable && !expanded && styles.clamped)}
      >
        {text}
      </p>
      {clampable && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Less' : 'More'}
          <Icon name="chevron-down" size={14} strokeWidth={2.2} />
        </button>
      )}
    </div>
  )
}
