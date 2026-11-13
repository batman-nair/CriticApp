import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { makeSessionUser } from '../test/fixtures'
import { sessionAs } from '../test/handlers'
import { queryWrapper } from '../test/render'
import { server } from '../test/server'
import { fromParentState } from '../ui/Dialog/useRouteDialog'
import { useAddReviewLink } from './useAddReviewLink'
import { useSession } from './useSession'

/** Renders the hook on `path`, the list unless given. */
function renderLink(path = '/') {
  const QueryWrapper = queryWrapper()
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryWrapper>
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
      </QueryWrapper>
    )
  }
  return renderHook(
    () => ({ link: useAddReviewLink(), session: useSession() }),
    { wrapper: Wrapper },
  )
}

const toAdd = {
  to: { pathname: '/add', search: '' },
  state: fromParentState,
}

it('is /add while the session is pending', () => {
  const { result } = renderLink()
  expect(result.current.session.isPending).toBe(true)
  expect(result.current.link).toEqual(toAdd)
})

it('is /add for the owner', async () => {
  const { result } = renderLink()
  await waitFor(() => expect(result.current.session.isOwner).toBe(true))
  expect(result.current.link).toEqual(toAdd)
})

it('keeps the list’s filters, so closing goes back to them', async () => {
  const { result } = renderLink('/?q=dune&category=movie')
  await waitFor(() => expect(result.current.session.isOwner).toBe(true))
  expect(result.current.link).toEqual({
    to: { pathname: '/add', search: '?q=dune&category=movie' },
    state: fromParentState,
  })
})

it('drops the query of a page that isn’t the list', async () => {
  const { result } = renderLink('/does-not-exist?q=dune')
  await waitFor(() => expect(result.current.session.isOwner).toBe(true))
  expect(result.current.link).toEqual(toAdd)
})

it('goes through the login page when logged out', async () => {
  server.use(sessionAs(null))
  const { result } = renderLink('/?q=dune')
  await waitFor(() => expect(result.current.session.isPending).toBe(false))
  expect(result.current.link).toEqual({ to: '/login?next=%2Fadd' })
})

it('is null for someone logged in who isn’t the owner', async () => {
  server.use(sessionAs(makeSessionUser({ id: 2, username: 'guest' })))
  const { result } = renderLink()
  await waitFor(() => expect(result.current.session.user).not.toBeNull())
  expect(result.current.link).toBeNull()
})
