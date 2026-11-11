import { createOpenApiHttp } from 'openapi-msw'
import type { paths } from '../api/schema'
import { makeCategory, makeItem, makeReview, makeReviewPage } from './fixtures'

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
  // One page of two, so pages that list reviews render. Tests that care about
  // the list override it with server.use.
  http.get('/api/v3/reviews', ({ response }) =>
    response(200).json(
      makeReviewPage([
        makeReview(),
        makeReview({
          id: 2,
          item: makeItem({
            id: 'tt0133093',
            category: 'movie',
            title: 'The Matrix',
            start_year: 1999,
            end_year: null,
            genres: ['Action', 'Sci-Fi'],
            details: { media_type: 'movie' },
          }),
          rating: 8,
          text: null,
        }),
      ]),
    ),
  ),
]
