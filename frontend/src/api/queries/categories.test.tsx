import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { http } from '../../test/handlers'
import { queryWrapper } from '../../test/render'
import { server } from '../../test/server'
import { ApiError } from '../client'
import { useCategories } from './categories'

function renderUseCategories() {
  return renderHook(() => useCategories(), { wrapper: queryWrapper() })
}

it('is pending until the response arrives', async () => {
  const { result } = renderUseCategories()

  expect(result.current.isPending).toBe(true)
  await waitFor(() => expect(result.current.isPending).toBe(false))
})

it('returns the categories and keeps them fresh', async () => {
  const { result } = renderUseCategories()

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.map((category) => category.label)).toEqual([
    'Movies',
    'Series',
    'Games',
    'Anime',
    'Manga',
    'Books',
  ])
  expect(result.current.isStale).toBe(false)
})

it('exposes a failure as an ApiError', async () => {
  server.use(
    http.get('/api/v3/categories', ({ response }) =>
      response.untyped(new HttpResponse(null, { status: 500 })),
    ),
  )
  const { result } = renderUseCategories()

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
})
