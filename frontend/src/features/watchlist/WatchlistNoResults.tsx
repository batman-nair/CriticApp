import styles from './WatchlistNoResults.module.css'

/** The search or language matches nothing on the watchlist. */
export function WatchlistNoResults() {
  return (
    <div className={styles.empty}>
      <h2 className={styles.title}>Nothing on your watchlist matches</h2>
      <p className={styles.text}>
        Try another word, or widen the category or language.
      </p>
    </div>
  )
}
