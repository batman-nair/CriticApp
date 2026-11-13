import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from './useDebouncedValue'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function render(initial: string) {
  return renderHook(
    ({ value }) => useDebouncedValue(value, SEARCH_DEBOUNCE_MS),
    { initialProps: { value: initial } },
  )
}

it('starts with the value', () => {
  const { result } = render('wit')
  expect(result.current).toBe('wit')
})

it('updates only after 300 ms of quiet', () => {
  const { result, rerender } = render('')

  rerender({ value: 'w' })
  act(() => vi.advanceTimersByTime(200))
  rerender({ value: 'wi' })
  act(() => vi.advanceTimersByTime(200))
  rerender({ value: 'wit' })
  act(() => vi.advanceTimersByTime(299))
  expect(result.current).toBe('')

  act(() => vi.advanceTimersByTime(1))
  expect(result.current).toBe('wit')
})
