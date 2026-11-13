import type { components } from '../api/schema'
import type {
  Category,
  Item,
  Problem,
  Review,
  ReviewFacets,
  ReviewPage,
  SessionUser,
  Tag,
} from '../api/types'
import { OWNER_USERNAME } from '../config'

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'movie',
    label: 'Movies',
    source: 'OMDb',
    rating_label: 'IMDb',
    subcategories: [],
    ...overrides,
  }
}

/**
 * An anime series unless overridden. Pass `category` and `details` together:
 * the result isn't checked against the matching member of the union.
 */
export function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'mal:1',
    category: 'anime',
    title: 'Cowboy Bebop',
    image_url: 'https://cdn.example.com/cowboy-bebop.jpg',
    start_year: 1998,
    end_year: 1999,
    genres: ['Action', 'Award Winning', 'Sci-Fi', 'Drama'],
    creators: ['Sunrise'],
    languages: ['Japanese'],
    description: 'A bounty hunter crew drifts through the solar system.',
    provider_rating: 8.8,
    details: { media_type: 'tv' },
    ...overrides,
  } as Item
}

export function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 1,
    user: { username: OWNER_USERNAME },
    item: makeItem(),
    rating: 9.5,
    text: 'Still the coolest thing ever animated.',
    tags: [],
    created_at: '2025-03-01T12:00:00Z',
    updated_at: '2025-03-02T12:00:00Z',
    ...overrides,
  }
}

/** A page of `reviews`. The count defaults to there being no more pages. */
export function makeReviewPage(
  reviews: Review[],
  { count, offset = 0 }: { count?: number; offset?: number } = {},
): ReviewPage {
  // Not REVIEW_PAGE_SIZE: importing the query loads client.ts, which needs
  // window, and setup.ts loads this file for node tests too.
  return {
    data: reviews,
    meta: {
      pagination: {
        count: count ?? offset + reviews.length,
        limit: 20,
        offset,
      },
    },
  }
}

/**
 * The counts for the default list handler's two reviews: an anime series and
 * a movie, both Japanese. Every chip is listed, in /categories order.
 */
export function makeReviewFacets(
  overrides: Partial<ReviewFacets> = {},
): components['schemas']['ReviewFacetsResponse'] {
  const counts: Record<string, number> = { movie: 1, 'anime:series': 1 }
  return {
    data: {
      total: 2,
      categories: [
        'movie',
        'series',
        'game',
        'anime:series',
        'anime:movie',
        'manga',
        'book',
      ].map((id) => ({ id, count: counts[id] ?? 0 })),
      languages: [{ name: 'Japanese', count: 2 }],
      ...overrides,
    },
    meta: {},
  }
}

export function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    code: 'NOT_FOUND',
    detail: 'Not found.',
    ...overrides,
  }
}

/** The owner unless overridden. */
export function makeSessionUser(
  overrides: Partial<SessionUser> = {},
): SessionUser {
  return { id: 1, username: OWNER_USERNAME, ...overrides }
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { name: 'rewatch', count: 1, ...overrides }
}
