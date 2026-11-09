import { Link } from 'react-router'
import { Button } from '../ui/Button/Button'
import { buttonClass } from '../ui/Button/buttonClass'
import layoutStyles from './AppLayout.module.css'
import { StatusDigit, StatusPage, StatusTile } from './StatusPage'
import statusStyles from './StatusPage.module.css'

interface ServerErrorPageProps {
  /** The root boundary replaces AppLayout, so it needs its own landmark. */
  standalone?: boolean
}

export function ServerErrorPage({ standalone = false }: ServerErrorPageProps) {
  const page = (
    <>
      {/* Mounts after the route title, so React places it first and it wins. */}
      <title>Something broke · Critic</title>
      <StatusPage
        art={
          <>
            <StatusDigit tone="movie">5</StatusDigit>
            <StatusTile tilt="left" />
            <StatusTile tilt="right" />
          </>
        }
        title="Something broke on our end"
        text="It's not you. Give it a moment and try again."
        actions={
          <>
            <Button
              variant="primary"
              size="md"
              className={statusStyles.action}
              onClick={() => window.location.reload()}
            >
              Try again
            </Button>
            <Link
              to="/"
              className={buttonClass({
                variant: 'secondary',
                size: 'md',
                className: statusStyles.action,
              })}
            >
              Back to my reviews
            </Link>
          </>
        }
      />
    </>
  )

  return standalone ? <main className={layoutStyles.main}>{page}</main> : page
}
