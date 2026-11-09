import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubSystemTheme } from '../test/matchMedia'
import { useTheme } from './useTheme'

const KEY = 'critic-theme'
const root = document.documentElement

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  delete root.dataset.theme
})

function blockStorage() {
  const blocked = () => {
    throw new DOMException('Blocked', 'SecurityError')
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
}

it('follows the system and writes the theme when none was applied', () => {
  stubSystemTheme('dark')
  const { result } = renderHook(() => useTheme())
  expect(result.current.theme).toBe('dark')
  expect(root.dataset.theme).toBe('dark')
})

it('keeps the theme the inline script applied', () => {
  stubSystemTheme('light')
  root.dataset.theme = 'dark'
  const { result } = renderHook(() => useTheme())
  expect(result.current.theme).toBe('dark')
})

it('follows a live system change', () => {
  const setSystem = stubSystemTheme('light')
  const { result } = renderHook(() => useTheme())
  act(() => setSystem('dark'))
  expect(result.current.theme).toBe('dark')
  expect(root.dataset.theme).toBe('dark')
})

it('ignores a system change once a choice is stored', () => {
  const setSystem = stubSystemTheme('light')
  const { result } = renderHook(() => useTheme())
  act(() => result.current.toggle())
  act(() => setSystem('light'))
  act(() => setSystem('dark'))
  act(() => setSystem('light'))
  expect(result.current.theme).toBe('dark')
})

it('toggles both ways', () => {
  stubSystemTheme('light')
  const { result } = renderHook(() => useTheme())
  act(() => result.current.toggle())
  expect(result.current.theme).toBe('dark')
  expect(root.dataset.theme).toBe('dark')
  act(() => result.current.toggle())
  expect(result.current.theme).toBe('light')
  expect(root.dataset.theme).toBe('light')
})

it('persists the choice', () => {
  stubSystemTheme('light')
  const { result } = renderHook(() => useTheme())
  act(() => result.current.toggle())
  expect(localStorage.getItem(KEY)).toBe('dark')
})

it('honours a stored choice on mount', () => {
  stubSystemTheme('dark')
  localStorage.setItem(KEY, 'light')
  const { result } = renderHook(() => useTheme())
  expect(result.current.theme).toBe('light')
  expect(root.dataset.theme).toBe('light')
})

it('falls back to the system for an invalid stored value', () => {
  stubSystemTheme('dark')
  localStorage.setItem(KEY, 'purple')
  const { result } = renderHook(() => useTheme())
  expect(result.current.theme).toBe('dark')
})

it('updates every component using the hook', () => {
  stubSystemTheme('light')
  const first = renderHook(() => useTheme())
  const second = renderHook(() => useTheme())
  act(() => first.result.current.toggle())
  expect(second.result.current.theme).toBe('dark')
})

it('follows the system when storage throws', () => {
  blockStorage()
  stubSystemTheme('dark')
  const { result } = renderHook(() => useTheme())
  expect(result.current.theme).toBe('dark')
})

it('still toggles for the session when storage throws', () => {
  blockStorage()
  stubSystemTheme('light')
  const { result } = renderHook(() => useTheme())
  act(() => result.current.toggle())
  expect(result.current.theme).toBe('dark')
  expect(root.dataset.theme).toBe('dark')
})
