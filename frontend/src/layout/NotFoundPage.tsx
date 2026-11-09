import { useState, type FormEvent } from 'react'
import { createSearchParams, Link, useNavigate } from 'react-router'
import { buttonClass } from '../ui/Button/buttonClass'
import { SearchField } from '../ui/SearchField/SearchField'
import styles from './NotFoundPage.module.css'
import { StatusDigit, StatusPage, StatusTile } from './StatusPage'
import statusStyles from './StatusPage.module.css'

export function NotFoundPage() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const q = query.trim()
    void navigate(q ? `/?${createSearchParams({ q })}` : '/')
  }

  return (
    <StatusPage
      art={
        <>
          <StatusDigit tone="movie">4</StatusDigit>
          <StatusTile tilt="left" category="game" />
          <StatusDigit tone="book">4</StatusDigit>
        </>
      }
      title="This page isn't on the shelf"
      text="The link might be old, or the review was deleted."
      actions={
        <Link
          to="/"
          className={buttonClass({
            variant: 'primary',
            size: 'md',
            className: statusStyles.action,
          })}
        >
          Back to my reviews
        </Link>
      }
    >
      <form className={styles.search} onSubmit={handleSubmit}>
        <span className={styles.caption} aria-hidden="true">
          Or search your reviews
        </span>
        <SearchField
          label="Search your reviews"
          placeholder="A title, a genre, a word you used"
          tone="sheet"
          className={styles.field}
          value={query}
          onValueChange={setQuery}
        />
      </form>
    </StatusPage>
  )
}
