import { expect, it } from 'vitest'
import { ApiError, client, unwrap } from '../api/client'
import { takeUnhandledRequests } from './server'

// These need an endpoint with no default handler in handlers.ts.
it('records a request with no handler and fails it', async () => {
  const error = await unwrap(
    client.DELETE('/api/v3/watchlist/{item_id}', {
      params: { path: { item_id: 'tt0133093' } },
    }),
  ).catch((e) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ kind: 'http', status: 500 })
  expect(takeUnhandledRequests()).toEqual([
    'DELETE http://localhost:3000/api/v3/watchlist/tt0133093',
  ])
})

// it.fails also covers afterEach, which is where setup.ts fails this test.
it.fails('fails a test that handles the failed request itself', async () => {
  await client.DELETE('/api/v3/watchlist/{item_id}', {
    params: { path: { item_id: 'tt0133093' } },
  })
})
