import { createOpenApiHttp } from 'openapi-msw'
import type { paths } from '../api/schema'
import type { SessionUser } from '../api/types'
import {
  makeCategory,
  makeItem,
  makeProblem,
  makeReview,
  makeReviewFacets,
  makeReviewPage,
  makeSessionUser,
  makeTag,
  makeWatchlistEntry,
  makeWatchlistFacets,
  makeWatchlistPage,
} from './fixtures'

// jsdom's URL under Vitest. Not read from window, because setup.ts also loads
// this file for tests in the node environment.
export const http = createOpenApiHttp<paths>({
  baseUrl: 'http://localhost:3000',
})

/**
 * The default list's two reviews, also served one by one at
 * /api/v3/reviews/{id}.
 */
export const defaultReviews = [
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
]

/**
 * The default watchlist, newest first: a movie added after an anime series.
 */
export const defaultWatchlist = [
  makeWatchlistEntry({
    item: makeItem({
      id: 'tt15239678',
      category: 'movie',
      title: 'Dune: Part Two',
      image_url: 'https://cdn.example.com/dune-part-two.jpg',
      start_year: 2024,
      end_year: null,
      genres: ['Sci-Fi', 'Adventure'],
      details: { media_type: 'movie' },
    }),
    added_at: '2025-04-02T12:00:00Z',
  }),
  makeWatchlistEntry({
    item: makeItem({
      id: 'mal:52991',
      title: 'Frieren: Beyond Journey’s End',
      image_url: 'https://cdn.example.com/frieren.jpg',
      start_year: 2023,
      end_year: 2024,
      genres: ['Adventure', 'Fantasy', 'Drama'],
    }),
    added_at: '2025-04-01T12:00:00Z',
  }),
]

/** The id the default POST /api/v3/reviews handler gives a new review. */
export const CREATED_REVIEW_ID = 3

/** The token the CSRF handler sets. */
export const CSRF_TOKEN = 'test-token'

/**
 * A session handler for server.use: `null` is logged out. The default
 * handlers have the owner logged in.
 */
export function sessionAs(user: SessionUser | null) {
  return http.get('/api/auth/session', ({ response }) =>
    response(200).json({ data: { user }, meta: {} }),
  )
}

export const handlers = [
  sessionAs(makeSessionUser()),
  // MSW keeps a mocked Set-Cookie in its own store, not in jsdom's
  // document.cookie, so the handler writes the cookie itself.
  http.get('/api/auth/csrf', ({ response }) => {
    document.cookie = `csrftoken=${CSRF_TOKEN}; path=/`
    return response(204).empty()
  }),
  http.post('/api/auth/login', ({ response }) =>
    response(200).json({ data: { user: makeSessionUser() }, meta: {} }),
  ),
  http.post('/api/auth/logout', ({ response }) => response(204).empty()),
  http.get('/api/v3/categories', ({ response }) =>
    response(200).json({
      data: [
        makeCategory(),
        makeCategory({ id: 'series', label: 'Series' }),
        makeCategory({ id: 'game', label: 'Games', source: 'IGDB' }),
        makeCategory({
          id: 'anime',
          label: 'Anime',
          source: 'MyAnimeList',
          rating_label: 'MyAnimeList',
        }),
        makeCategory({
          id: 'manga',
          label: 'Manga',
          source: 'MyAnimeList',
          rating_label: 'MyAnimeList',
        }),
        makeCategory({
          id: 'book',
          label: 'Books',
          source: 'Open Library',
          rating_label: 'Open Library',
        }),
      ],
      meta: {},
    }),
  ),
  // One page of two, so pages that list reviews render. Tests that care about
  // the list override it with server.use.
  http.get('/api/v3/reviews', ({ response }) =>
    response(200).json(makeReviewPage(defaultReviews)),
  ),
  // The counts for the two reviews above.
  http.get('/api/v3/reviews/facets', ({ response }) =>
    response(200).json(makeReviewFacets()),
  ),
  // Created from the body, so the happy path needs no override. Tests for a
  // 400, 409 or 502 override it with server.use.
  http.post('/api/v3/reviews', async ({ request, response }) => {
    const { item_id, rating, text, tags } = await request.json()
    return response(201).json({
      data: makeReview({
        id: CREATED_REVIEW_ID,
        item: makeItem({ id: item_id }),
        rating,
        text: text || null,
        tags: tags ?? [],
      }),
      meta: {},
    })
  }),
  // After the facets, which {id} would match too. A test that overrides this
  // with server.use also catches /facets.
  http.get('/api/v3/reviews/{id}', ({ params, response }) => {
    const review = defaultReviews.find((r) => r.id === Number(params.id))
    return review
      ? response(200).json({ data: review, meta: {} })
      : response(404).json(makeProblem())
  }),
  // The ordering note above is about GET only. Returns the review with the
  // body merged in, without changing defaultReviews, which other tests share.
  http.patch('/api/v3/reviews/{id}', async ({ params, request, response }) => {
    const review = defaultReviews.find((r) => r.id === Number(params.id))
    if (!review) return response(404).json(makeProblem())
    const update = await request.json()
    return response(200).json({ data: { ...review, ...update }, meta: {} })
  }),
  http.delete('/api/v3/reviews/{id}', ({ response }) => response(204).empty()),
  // Any stored item, by the id asked for. Tests for a 404 or an error
  // override it with server.use.
  http.get('/api/v3/items/{item_id}', ({ params, response }) =>
    response(200).json({ data: makeItem({ id: params.item_id }), meta: {} }),
  ),
  // Nothing found. Tests that search override it with server.use.
  http.get('/api/v3/search', ({ response }) =>
    response(200).json({ data: [], meta: {} }),
  ),
  // One page of two, so the watchlist renders. Tests that care about the
  // list override it with server.use.
  http.get('/api/v3/watchlist', ({ response }) =>
    response(200).json(makeWatchlistPage(defaultWatchlist)),
  ),
  // The counts for the two entries above.
  http.get('/api/v3/watchlist/facets', ({ response }) =>
    response(200).json(makeWatchlistFacets()),
  ),
  // A new entry for the item asked for. Tests that need a 200, 409 or an
  // error override it with server.use.
  http.post('/api/v3/watchlist', async ({ request, response }) => {
    const { item_id, added_at } = await request.json()
    return response(201).json({
      data: makeWatchlistEntry({
        item: makeItem({ id: item_id }),
        ...(added_at && { added_at }),
      }),
      meta: {},
    })
  }),
  // Removed. Tests that need a 404 or an error override it with server.use.
  http.delete('/api/v3/watchlist/{item_id}', ({ response }) =>
    response(204).empty(),
  ),
  // The owner's most-used tags.
  http.get('/api/v3/tags', ({ response }) =>
    response(200).json({
      data: [
        makeTag({ count: 3 }),
        makeTag({ name: 'comfort', count: 2 }),
        makeTag({ name: 'soundtrack' }),
      ],
      meta: {},
    }),
  ),
]
