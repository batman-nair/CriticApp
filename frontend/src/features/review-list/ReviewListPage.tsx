import { Outlet } from 'react-router'
import styles from './ReviewListPage.module.css'

export function ReviewListPage() {
  return (
    <>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          Everything I’ve <span className={styles.watched}>watched</span>,{' '}
          <br />
          <span className={styles.played}>played</span> and{' '}
          <span className={styles.read}>read</span>.
        </h1>
      </section>
      <Outlet />
    </>
  )
}
