import { renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { makeSessionUser } from '../test/fixtures'
import { sessionAs } from '../test/handlers'
import { queryWrapper } from '../test/render'
import { server } from '../test/server'
import { useAddReviewLink } from './useAddReviewLink'
import { useSession } from './useSession'

function renderLink() {
  return renderHook(
    () => ({ link: useAddReviewLink(), session: useSession() }),
    { wrapper: queryWrapper() },
  )
}

it('is /add while the session is pending', () => {
  const { result } = renderLink()
  expect(result.current.session.isPending).toBe(true)
  expect(result.current.link).toBe('/add')
})

it('is /add for the owner', async () => {
  const { result } = renderLink()
  await waitFor(() => expect(result.current.session.isOwner).toBe(true))
  expect(result.current.link).toBe('/add')
})

it('goes through the login page when logged out', async () => {
  server.use(sessionAs(null))
  const { result } = renderLink()
  await waitFor(() => expect(result.current.session.isPending).toBe(false))
  expect(result.current.link).toBe('/login?next=%2Fadd')
})

it('is null for someone logged in who isn’t the owner', async () => {
  server.use(sessionAs(makeSessionUser({ id: 2, username: 'guest' })))
  const { result } = renderLink()
  await waitFor(() => expect(result.current.session.user).not.toBeNull())
  expect(result.current.link).toBeNull()
})
