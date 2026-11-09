import { expect, it } from 'vitest'
import { categoryVars } from './categories'

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
