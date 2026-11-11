import { expect, it } from 'vitest'
import { formatYears } from './format'

it.each([
  [2018, 2021, '2018–2021'],
  [2018, null, '2018'],
  [2018, 2018, '2018'],
  [null, null, ''],
  [null, 2021, ''],
])('formats %s to %s as "%s"', (start, end, expected) => {
  expect(formatYears(start, end)).toBe(expected)
})
