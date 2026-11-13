import { afterEach, expect, it, vi } from 'vitest'
import { readLastCategory, writeLastCategory } from './lastCategory'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

it('reads null when nothing is stored', () => {
  expect(readLastCategory()).toBeNull()
})

it('reads back what it wrote', () => {
  writeLastCategory('manga')
  expect(readLastCategory()).toBe('manga')
  expect(localStorage.getItem('critic-add-category')).toBe('manga')
})

it('reads null for a stored value that isn’t a search category', () => {
  localStorage.setItem('critic-add-category', 'anime:movie')
  expect(readLastCategory()).toBeNull()
})

it('neither throws nor stores when storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError')
  })

  expect(() => writeLastCategory('book')).not.toThrow()
  expect(readLastCategory()).toBeNull()
})
