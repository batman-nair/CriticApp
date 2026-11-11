import styles from './NoMatches.module.css'

/** The filters match no reviews. */
export function NoMatches() {
  return (
    <div className={styles.empty}>
      <h2 className={styles.title}>Haven’t reviewed anything like that</h2>
      <p className={styles.text}>
        Try another word, or widen the category or language.
      </p>
    </div>
  )
}
