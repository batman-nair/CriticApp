import { Outlet } from 'react-router'
import styles from './AppLayout.module.css'
import { Footer } from './Footer'
import { Header } from './Header'

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <Header />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
