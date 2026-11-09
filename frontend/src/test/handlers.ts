import { createOpenApiHttp } from 'openapi-msw'
import type { paths } from '../api/schema'
import { makeCategory } from './fixtures'

// jsdom's URL under Vitest. Not read from window, because setup.ts also loads
// this file for tests in the node environment.
export const http = createOpenApiHttp<paths>({
  baseUrl: 'http://localhost:3000',
})

export const handlers = [
  http.get('/api/v3/categories', ({ response }) =>
    response(200).json({
      data: [
        makeCategory(),
        makeCategory({ id: 'game', label: 'Games', source: 'IGDB' }),
      ],
      meta: {},
    }),
  ),
]
