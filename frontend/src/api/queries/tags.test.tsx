import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { http } from '../../test/handlers'
import { queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { ApiError } from '../client'
import type { Tag } from '../types'
import { tagKeys, useTags } from './tags'

/** Serves `tags` and records each request's query string. */
function serveTags(tags: Tag[]) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get('/api/v3/tags', ({ request, response }) => {
      requests.push(new URL(request.url).searchParams)
      return response(200).json({ data: tags, meta: {} })
    }),
  )
  return requests
}

it('asks for the logged-in user’s tags and returns them', async () => {
  const tags = [
    { name: 'rewatch', count: 3 },
    { name: 'cozy', count: 1 },
  ]
  const requests = serveTags(tags)
  const { result } = renderHook(() => useTags(), { wrapper: queryWrapper() })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(requests.map((params) => Object.fromEntries(params))).toEqual([{}])
  expect(result.current.data).toEqual(tags)
})

it('does not fetch while disabled', () => {
  const requests = serveTags([{ name: 'cozy', count: 1 }])
  const { result } = renderHook(() => useTags({ enabled: false }), {
    wrapper: queryWrapper(),
  })

  expect(result.current.fetchStatus).toBe('idle')
  expect(result.current.data).toBeUndefined()
  expect(requests).toEqual([])
})

it('exposes a failure as an ApiError', async () => {
  server.use(
    http.get('/api/v3/tags', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 500 })),
    ),
  )
  const { result } = renderHook(() => useTags(), { wrapper: queryWrapper() })

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
})

it('keys the list under all', () => {
  expect(tagKeys.list().slice(0, 1)).toEqual(tagKeys.all)
})
