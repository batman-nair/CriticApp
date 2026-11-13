import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useKeyboardInset } from './useKeyboardInset'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** jsdom has no visualViewport. Undo with vi.unstubAllGlobals(). */
function stubVisualViewport(height = window.innerHeight) {
  const viewport = Object.assign(new EventTarget(), { height, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  return {
    viewport,
    set(change: { height?: number; offsetTop?: number }, type = 'resize') {
      Object.assign(viewport, change)
      act(() => {
        viewport.dispatchEvent(new Event(type))
      })
    },
  }
}

it('is 0 without visualViewport', () => {
  vi.stubGlobal('visualViewport', undefined)
  const { result } = renderHook(() => useKeyboardInset(true))
  expect(result.current).toBe(0)
})

it('is 0 while the visual viewport fills the window', () => {
  stubVisualViewport()
  const { result } = renderHook(() => useKeyboardInset(true))
  expect(result.current).toBe(0)
})

it('gives the keyboard height when the visual viewport shrinks', () => {
  const { set } = stubVisualViewport()
  const { result } = renderHook(() => useKeyboardInset(true))

  set({ height: window.innerHeight - 300.4 })
  expect(result.current).toBe(300)

  set({ height: window.innerHeight })
  expect(result.current).toBe(0)
})

it('takes off the offset when the visual viewport scrolls', () => {
  const { set } = stubVisualViewport()
  const { result } = renderHook(() => useKeyboardInset(true))

  set({ height: window.innerHeight - 300 })
  set({ offsetTop: 100 }, 'scroll')
  expect(result.current).toBe(200)
})

it('never goes below 0', () => {
  const { set } = stubVisualViewport()
  const { result } = renderHook(() => useKeyboardInset(true))

  set({ offsetTop: 50 }, 'scroll')
  expect(result.current).toBe(0)
})

it('is 0 and does not listen while disabled', () => {
  const { viewport } = stubVisualViewport(window.innerHeight - 300)
  const add = vi.spyOn(viewport, 'addEventListener')
  const { result } = renderHook(() => useKeyboardInset(false))

  expect(result.current).toBe(0)
  expect(add).not.toHaveBeenCalled()
})

it('removes its listeners when disabled and on unmount', () => {
  const { viewport } = stubVisualViewport()
  const remove = vi.spyOn(viewport, 'removeEventListener')
  const { result, rerender, unmount } = renderHook(
    ({ enabled }) => useKeyboardInset(enabled),
    { initialProps: { enabled: true } },
  )

  rerender({ enabled: false })
  expect(result.current).toBe(0)
  expect(remove.mock.calls.map(([type]) => type).sort()).toEqual([
    'resize',
    'scroll',
  ])

  remove.mockClear()
  rerender({ enabled: true })
  unmount()
  expect(remove.mock.calls.map(([type]) => type).sort()).toEqual([
    'resize',
    'scroll',
  ])
})
