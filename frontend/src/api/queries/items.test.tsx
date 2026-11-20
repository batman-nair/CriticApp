import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { makeProblem } from '../../test/fixtures'
import { http } from '../../test/handlers'
import { queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { ApiError } from '../client'
import { useItem } from './items'

afterEach(() => server.events.removeAllListeners())

function recordItemRequests() {
  const paths: string[] = []
  server.events.on('request:start', ({ request }) => {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/v3/items/')) paths.push(pathname)
  })
  return paths
}

it('returns the item, asking for the encoded id', async () => {
  const requests = recordItemRequests()
  const { result } = renderHook(() => useItem('igdb:1942'), {
    wrapper: queryWrapper(),
  })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toMatchObject({
    id: 'igdb:1942',
    title: 'Cowboy Bebop',
  })
  expect(requests).toEqual(['/api/v3/items/igdb%3A1942'])
})

it('exposes a 404 as an ApiError with that status', async () => {
  server.use(
    http.get('/api/v3/items/{item_id}', ({ response }) =>
      response(404).json(makeProblem()),
    ),
  )
  const { result } = renderHook(() => useItem('mal:404'), {
    wrapper: queryWrapper(),
  })

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect((result.current.error as ApiError).status).toBe(404)
})

it('sends nothing while disabled', async () => {
  const requests = recordItemRequests()
  const { result } = renderHook(() => useItem('mal:1', { enabled: false }), {
    wrapper: queryWrapper(),
  })

  // Long enough for an enabled query's request to have started.
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(result.current.fetchStatus).toBe('idle')
  expect(requests).toEqual([])
})
