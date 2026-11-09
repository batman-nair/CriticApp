import { expect, it } from 'vitest'
import { ApiError, client, unwrap } from '../api/client'
import { takeUnhandledRequests } from './server'

it('records a request with no handler and fails it', async () => {
  const error = await unwrap(client.GET('/api/v3/tags')).catch((e) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ kind: 'http', status: 500 })
  expect(takeUnhandledRequests()).toEqual([
    'GET http://localhost:3000/api/v3/tags',
  ])
})
