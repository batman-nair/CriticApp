import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import { Poster } from '../ui/Poster/Poster'
import styles from './StatusPage.module.css'

interface StatusPageProps {
  art: ReactNode
  title: string
  text: string
  actions: ReactNode
  children?: ReactNode
}

export function StatusPage({
  art,
  title,
  text,
  actions,
  children,
}: StatusPageProps) {
  return (
    <div className={styles.page}>
      <div className={styles.art} aria-hidden="true">
        {art}
      </div>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text}>{text}</p>
      <div className={styles.actions}>{actions}</div>
      {children}
    </div>
  )
}

export function StatusDigit({
  tone,
  children,
}: {
  tone: 'movie' | 'book'
  children: string
}) {
  return <span className={cx(styles.digit, styles[tone])}>{children}</span>
}

/** The "0" of a status code. The boards' poster images aren't in the export. */
export function StatusTile({
  tilt,
  category,
}: {
  tilt: 'left' | 'right'
  category?: string
}) {
  return (
    <Poster
      title="0"
      category={category}
      className={cx(styles.tile, styles[tilt])}
    />
  )
}
