import { useState } from 'react'
import { categoryVars } from '../../lib/categories'
import { cx } from '../../lib/cx'
import styles from './Poster.module.css'

interface PosterProps {
  src?: string | null
  title: string
  alt?: string
  category?: string
  className?: string
}

export function Poster({
  src,
  title,
  alt = '',
  category,
  className,
}: PosterProps) {
  // Keyed by URL, so a new src gets a fresh attempt without an effect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = failedSrc === src

  return (
    <div
      className={cx(styles.root, className)}
      style={category ? categoryVars(category) : undefined}
    >
      {src && !failed ? (
        <img
          className={styles.image}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div
          className={styles.fallback}
          {...(alt
            ? { role: 'img', 'aria-label': alt }
            : { 'aria-hidden': 'true' })}
        >
          {Array.from(title.trim())[0]?.toUpperCase() ?? '?'}
        </div>
      )}
    </div>
  )
}
