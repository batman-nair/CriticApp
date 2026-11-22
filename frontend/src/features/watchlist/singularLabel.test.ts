import { expect, it } from 'vitest'
import { singularLabel } from './singularLabel'

it.each([
  ['movie', 'Movie'],
  ['anime:series', 'Anime series'],
  ['anime:movie', 'Anime movie'],
  ['podcast', 'podcast'],
])('labels %s as "%s"', (category, label) => {
  expect(singularLabel(category)).toBe(label)
})
