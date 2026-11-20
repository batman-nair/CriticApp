import { expect, it } from 'vitest'
import {
  categoryLabel,
  categoryVars,
  FILTER_CATEGORIES,
  isFilterCategory,
  reviewCategory,
} from './categories'

it.each([
  ['movie', 'movie'],
  ['series', 'series'],
  ['game', 'game'],
  ['anime:series', 'anime-series'],
  ['anime:movie', 'anime-movie'],
  ['manga', 'manga'],
  ['book', 'book'],
])('maps %s to its variables', (id, token) => {
  expect(categoryVars(id)).toEqual({
    '--cat': `var(--cat-${token})`,
    '--cat-base': `var(--cat-${token}-base)`,
  })
})

it('gives plain anime the anime series colours', () => {
  expect(categoryVars('anime')).toEqual(categoryVars('anime:series'))
})

it.each(['podcast', 'constructor'])('falls back to muted for %s', (id) => {
  expect(categoryVars(id)).toEqual({
    '--cat': 'var(--muted)',
    '--cat-base': 'var(--muted)',
  })
})

it.each([
  ['anime', 'Movie', 'anime:movie'],
  ['anime', 'movie', 'anime:movie'],
  ['anime', 'tv', 'anime:series'],
  ['anime', null, 'anime:series'],
  ['anime', undefined, 'anime:series'],
  ['movie', 'movie', 'movie'],
  ['series', 'series', 'series'],
  ['game', undefined, 'game'],
])('files a %s item with media type %s under %s', (category, mediaType, id) => {
  expect(reviewCategory(category, mediaType)).toBe(id)
})

it.each([
  ['movie', 'Movies'],
  ['series', 'Series'],
  ['game', 'Games'],
  ['anime', 'Anime series'],
  ['anime:series', 'Anime series'],
  ['anime:movie', 'Anime movies'],
  ['manga', 'Manga'],
  ['book', 'Books'],
])('labels %s as %s', (id, label) => {
  expect(categoryLabel(id)).toBe(label)
})

it.each(['podcast', 'constructor'])('labels %s with its id', (id) => {
  expect(categoryLabel(id)).toBe(id)
})

it('lists the filter chips in /categories order', () => {
  expect(FILTER_CATEGORIES).toEqual([
    'movie',
    'series',
    'game',
    'anime:series',
    'anime:movie',
    'manga',
    'book',
  ])
})

it.each(FILTER_CATEGORIES)('takes %s as a filter category', (id) => {
  expect(isFilterCategory(id)).toBe(true)
})

it.each(['', 'anime', 'movie,game', 'podcast', 'constructor'])(
  'rejects %j as a filter category',
  (value) => {
    expect(isFilterCategory(value)).toBe(false)
  },
)
