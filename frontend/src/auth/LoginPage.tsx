import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { useLogin } from '../api/queries/auth'
import { cx } from '../lib/cx'
import { Button } from '../ui/Button/Button'
import { Icon } from '../ui/Icon/Icon'
import { PasswordField } from '../ui/PasswordField/PasswordField'
import { Poster } from '../ui/Poster/Poster'
import { TextField } from '../ui/TextField/TextField'
import styles from './LoginPage.module.css'
import { safeNext } from './next'
import { useSession } from './useSession'

interface Missing {
  username: boolean
  password: boolean
}

const NONE_MISSING: Missing = { username: false, password: false }

function errorMessage(error: Error): string {
  const code = error instanceof ApiError ? error.code : null
  if (code === 'INVALID_CREDENTIALS') {
    return 'That username and password don’t match. Try again.'
  }
  if (code === 'RATE_LIMITED') {
    return 'Too many tries. Wait a minute, then try again.'
  }
  return 'Couldn’t sign in. Try again.'
}

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  const target = safeNext(next)
  const { user } = useSession()
  const login = useLogin()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [missing, setMissing] = useState<Missing>(NONE_MISSING)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Already logged in on arrival, or just logged in: useLogin writes the
  // session, so both cases leave through here, once.
  if (user) return <Navigate to={target} replace />

  const showError = login.isError && !login.isPending
  const wrongCredentials =
    showError &&
    login.error instanceof ApiError &&
    login.error.code === 'INVALID_CREDENTIALS'
  // Only for a `next` that safeNext accepts. It turns a rejected one into `/`.
  const validNext = next !== null && (target !== '/' || next === '/')
  const showNotice = validNext && !showError

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (login.isPending) return

    const name = username.trim()
    const nowMissing = { username: !name, password: !password }
    if (nowMissing.username || nowMissing.password) {
      setMissing(nowMissing)
      login.reset()
      // noValidate, so nothing else says what's wrong.
      const firstMissing = nowMissing.username ? usernameRef : passwordRef
      firstMissing.current?.focus()
      return
    }

    setMissing(NONE_MISSING)
    login.mutate(
      { username: name, password },
      {
        onError: (error) => {
          if (
            error instanceof ApiError &&
            error.code === 'INVALID_CREDENTIALS'
          ) {
            setPassword('')
            passwordRef.current?.focus()
          }
        },
      },
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <Link to="/" className={styles.logo}>
          <span className={styles.tile} aria-hidden="true">
            c
          </span>
          Critic
        </Link>
        {/* The boards' poster images aren't in the export. */}
        <div className={styles.art} aria-hidden="true">
          <Poster
            title="Movies"
            category="movie"
            className={cx(styles.poster, styles.left)}
          />
          <Poster
            title="Books"
            category="book"
            className={cx(styles.poster, styles.right)}
          />
          <Poster
            title="Games"
            category="game"
            className={cx(styles.poster, styles.centre)}
          />
        </div>
        <p className={styles.hero}>
          Everything I’ve <span className={styles.watched}>watched</span>,
          <br />
          <span className={styles.played}>played</span> and{' '}
          <span className={styles.read}>read</span>.
        </p>
      </div>

      <main className={styles.main}>
        <form className={styles.form} noValidate onSubmit={handleSubmit}>
          <div className={styles.intro}>
            <h1 className={styles.title}>Welcome back</h1>
            <p className={styles.subtitle}>Sign in to add and edit reviews.</p>
          </div>

          {showNotice && (
            <div role="status" className={styles.notice}>
              <Icon name="lock" className={styles.noticeIcon} />
              Sign in to see that page.
            </div>
          )}
          {showError && (
            <div role="alert" className={cx(styles.notice, styles.alert)}>
              <Icon
                name="alert-circle"
                strokeWidth={2.2}
                className={styles.alertIcon}
              />
              {errorMessage(login.error)}
            </div>
          )}

          <TextField
            ref={usernameRef}
            label="Username"
            size="lg"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              setMissing((m) => ({ ...m, username: false }))
            }}
            error={missing.username ? 'Enter your username.' : undefined}
            aria-invalid={wrongCredentials || undefined}
            className={cx(wrongCredentials && styles.invalid)}
          />
          <PasswordField
            ref={passwordRef}
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setMissing((m) => ({ ...m, password: false }))
            }}
            error={missing.password ? 'Enter your password.' : undefined}
            aria-invalid={wrongCredentials || undefined}
            className={cx(wrongCredentials && styles.invalid)}
          />

          <Button
            type="submit"
            size="lg"
            busy={login.isPending}
            className={styles.submit}
          >
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </main>
    </div>
  )
}
