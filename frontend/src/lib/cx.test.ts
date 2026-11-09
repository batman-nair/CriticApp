import { expect, it } from 'vitest'
import { cx } from './cx'

it('joins class names with spaces', () => {
  expect(cx('a', 'b', 'c')).toBe('a b c')
})

it('skips falsy values', () => {
  expect(cx('a', undefined, false, null, '', 'b')).toBe('a b')
})

it('returns an empty string when nothing is left', () => {
  expect(cx(undefined, false)).toBe('')
})
