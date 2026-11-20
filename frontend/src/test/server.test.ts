import { expect, it } from 'vitest'
import { ApiError, client, unwrap } from '../api/client'
import { takeUnhandledRequests } from './server'

// Not in the schema, so no default handler will ever answer it.
const UNHANDLED = '/api/v3/no-such-endpoint' as '/api/v3/categories'

it('records a request with no handler and fails it', async () => {
  const error = await unwrap(client.GET(UNHANDLED)).catch((e) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ kind: 'http', status: 500 })
  expect(takeUnhandledRequests()).toEqual([
    'GET http://localhost:3000/api/v3/no-such-endpoint',
  ])
})

// it.fails also covers afterEach, which is where setup.ts fails this test.
it.fails('fails a test that handles the failed request itself', async () => {
  await client.GET(UNHANDLED)
})
