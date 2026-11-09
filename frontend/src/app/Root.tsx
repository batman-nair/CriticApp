import { Outlet, ScrollRestoration, useMatches } from 'react-router'

interface RouteHandle {
  title?: string
}

/** The deepest route's title, so a dialog's title beats the list behind it. */
function RouteTitle() {
  const title = useMatches()
    .map((match) => (match.handle as RouteHandle | undefined)?.title)
    .findLast(Boolean)

  return <title>{title ? `${title} · Critic` : 'Critic'}</title>
}

export function Root() {
  return (
    <>
      <RouteTitle />
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
