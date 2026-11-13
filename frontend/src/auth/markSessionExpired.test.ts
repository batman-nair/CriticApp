import { expect, it } from 'vitest'
import { authKeys } from '../api/queries/auth'
import { makeSessionUser } from '../test/fixtures'
import { createTestQueryClient } from '../test/render'
import { markSessionExpired } from './markSessionExpired'

it('logs the session out and marks it for a refetch', () => {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(authKeys.session(), { user: makeSessionUser() })

  markSessionExpired(queryClient)

  expect(queryClient.getQueryData(authKeys.session())).toEqual({ user: null })
  expect(queryClient.getQueryState(authKeys.session())?.isInvalidated).toBe(
    true,
  )
})
