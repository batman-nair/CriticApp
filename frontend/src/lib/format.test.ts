import { expect, it } from 'vitest'
import { formatMediaType, formatYears } from './format'

it.each([
  [2018, 2021, '2018–2021'],
  [2018, null, '2018'],
  [2018, 2018, '2018'],
  [null, null, ''],
  [null, 2021, ''],
])('formats %s to %s as "%s"', (start, end, expected) => {
  expect(formatYears(start, end)).toBe(expected)
})

it.each([
  [null, ''],
  ['', ''],
  ['  ', ''],
  ['unknown', ''],
  ['Unknown', ''],
  ['tv', 'TV'],
  ['TV', 'TV'],
  ['ova', 'OVA'],
  ['ona', 'ONA'],
  ['movie', 'Movie'],
  ['series', 'Series'],
  ['manhwa', 'Manhwa'],
  ['light_novel', 'Light novel'],
])('formats the media type %j as "%s"', (value, expected) => {
  expect(formatMediaType(value)).toBe(expected)
})
