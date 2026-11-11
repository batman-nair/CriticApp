import { render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubIntersectionObserver } from '../../test/intersectionObserver'
import { useLoadMoreOnScroll } from './useLoadMoreOnScroll'

afterEach(() => {
  vi.unstubAllGlobals()
})

function Sentinel(props: { enabled: boolean; onLoadMore: () => void }) {
  const ref = useLoadMoreOnScroll(props)
  return <div ref={ref} data-testid="sentinel" />
}

it('loads more when the sentinel comes near', () => {
  const { setIntersecting, observers } = stubIntersectionObserver()
  const onLoadMore = vi.fn()
  const { getByTestId } = render(<Sentinel enabled onLoadMore={onLoadMore} />)

  expect(observers).toHaveLength(1)
  expect(observers[0]?.options?.rootMargin).toBe('0px 0px 600px 0px')
  expect([...observers[0]!.elements]).toEqual([getByTestId('sentinel')])
  expect(onLoadMore).not.toHaveBeenCalled()

  setIntersecting(true)
  expect(onLoadMore).toHaveBeenCalledOnce()

  setIntersecting(false)
  expect(onLoadMore).toHaveBeenCalledOnce()
})

it('does nothing while disabled', () => {
  const { setIntersecting, observers } = stubIntersectionObserver()
  const onLoadMore = vi.fn()
  render(<Sentinel enabled={false} onLoadMore={onLoadMore} />)

  setIntersecting(true)

  expect(observers).toHaveLength(0)
  expect(onLoadMore).not.toHaveBeenCalled()
})

it('checks again when re-enabled with the sentinel still in view', () => {
  const { setIntersecting, observers } = stubIntersectionObserver()
  const onLoadMore = vi.fn()
  const { rerender } = render(<Sentinel enabled onLoadMore={onLoadMore} />)
  setIntersecting(true)
  expect(onLoadMore).toHaveBeenCalledTimes(1)

  // A page loading.
  rerender(<Sentinel enabled={false} onLoadMore={onLoadMore} />)
  expect(observers[0]?.disconnected).toBe(true)

  rerender(<Sentinel enabled onLoadMore={onLoadMore} />)
  expect(observers).toHaveLength(2)
  expect(onLoadMore).toHaveBeenCalledTimes(2)
})

it('keeps its observer when the callback changes, and calls the latest', () => {
  const { setIntersecting, observers } = stubIntersectionObserver()
  const first = vi.fn()
  const second = vi.fn()
  const { rerender } = render(<Sentinel enabled onLoadMore={first} />)

  rerender(<Sentinel enabled onLoadMore={second} />)
  setIntersecting(true)

  expect(observers).toHaveLength(1)
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledOnce()
})

it('disconnects on unmount', () => {
  const { observers } = stubIntersectionObserver()
  const { unmount } = render(<Sentinel enabled onLoadMore={() => {}} />)

  unmount()

  expect(observers[0]?.disconnected).toBe(true)
})
