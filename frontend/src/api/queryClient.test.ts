import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { http } from '../test/handlers'
import { queryWrapper } from '../test/render'
import { server } from '../test/server'
import { useCategories } from './queries/categories'
import { createQueryClient, shouldRetry } from './queryClient'

async function countRequests(respond: () => Response) {
  let requests = 0
  server.use(
    http.get('/api/v3/categories', ({ response }) => {
      requests += 1
      return response.untyped(respond())
    }),
  )
  const client = createQueryClient()
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  })

  const { result } = renderHook(() => useCategories(), {
    wrapper: queryWrapper(client),
  })
  await waitFor(() => expect(result.current.isError).toBe(true))
  return requests
}

it('does not retry a 4xx', async () => {
  const requests = await countRequests(
    () => new HttpResponse(null, { status: 404 }),
  )
  expect(requests).toBe(1)
})

it('does not retry a 200 with an unreadable body', async () => {
  const requests = await countRequests(
    () =>
      new HttpResponse('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
  )
  expect(requests).toBe(1)
})

it('retries a 5xx twice', async () => {
  const requests = await countRequests(
    () => new HttpResponse(null, { status: 503 }),
  )
  expect(requests).toBe(3)
})

it('retries a network failure twice', async () => {
  expect(await countRequests(() => HttpResponse.error())).toBe(3)
})

it('does not retry errors that are not ApiErrors', () => {
  expect(shouldRetry(0, new TypeError('bug'))).toBe(false)
})
