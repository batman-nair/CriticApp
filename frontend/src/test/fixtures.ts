import type { Category, Problem } from '../api/types'

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
