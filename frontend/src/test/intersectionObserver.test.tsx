import { render } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubIntersectionObserver } from './intersectionObserver'

afterEach(() => {
  vi.unstubAllGlobals()
})

function Sentinel({ onChange }: { onChange: (inView: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => onChange(entry.isIntersecting)),
      { rootMargin: '0px 0px 600px 0px' },
    )
    observer.observe(ref.current!)
    return () => observer.disconnect()
  }, [onChange])
  return <div ref={ref} />
}

it('has a no-op IntersectionObserver without the stub', () => {
  const onChange = vi.fn()

  const { unmount } = render(<Sentinel onChange={onChange} />)
  unmount()

  expect(onChange).not.toHaveBeenCalled()
})

it('reports the observed elements as in view or not', () => {
  const { setIntersecting, observers } = stubIntersectionObserver()
  const onChange = vi.fn()
  const { container } = render(<Sentinel onChange={onChange} />)

  setIntersecting(true)
  setIntersecting(false)

  expect(onChange.mock.calls).toEqual([[true], [false]])
  expect(observers).toHaveLength(1)
  expect(observers[0]?.options).toEqual({ rootMargin: '0px 0px 600px 0px' })
  expect([...(observers[0]?.elements ?? [])]).toEqual([container.firstChild])
})

it('reports at once to an observer created while in view', () => {
  const { setIntersecting } = stubIntersectionObserver()
  const first = vi.fn()
  const second = vi.fn()
  const { rerender } = render(<Sentinel onChange={first} />)
  setIntersecting(true)

  // A new callback makes the effect disconnect and observe again.
  rerender(<Sentinel onChange={second} />)

  expect(first).toHaveBeenCalledOnce()
  expect(second).toHaveBeenCalledExactlyOnceWith(true)
})

it('stops reporting to a disconnected observer', () => {
  const { setIntersecting, observers } = stubIntersectionObserver()
  const onChange = vi.fn()
  const { unmount } = render(<Sentinel onChange={onChange} />)

  unmount()
  setIntersecting(true)

  expect(onChange).not.toHaveBeenCalled()
  expect(observers[0]?.disconnected).toBe(true)
})
