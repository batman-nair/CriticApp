import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <span>
        Made by <a href="https://batmannair.com">Arjun Nair</a> · Code on{' '}
        <a href="https://github.com/batman-nair/CriticApp">GitHub</a>
      </span>
      <span>Data from OMDb, IGDB, MyAnimeList and Open Library</span>
    </footer>
  )
}
