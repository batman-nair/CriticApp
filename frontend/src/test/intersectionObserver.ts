import { act } from '@testing-library/react'
import { vi } from 'vitest'

export interface StubObserver {
  readonly options: IntersectionObserverInit | undefined
  /** What it observes now. Emptied by disconnect. */
  readonly elements: Set<Element>
  readonly disconnected: boolean
}

function entry(target: Element, isIntersecting: boolean) {
  const rect = target.getBoundingClientRect()
  return {
    target,
    isIntersecting,
    intersectionRatio: isIntersecting ? 1 : 0,
    boundingClientRect: rect,
    intersectionRect: rect,
    rootBounds: null,
    time: performance.now(),
  } as IntersectionObserverEntry
}

/**
 * jsdom has no IntersectionObserver, and setup.ts only adds one that never
 * fires. This one reports every observed element as in view or not, together,
 * and records each observer in `observers`. Undo with vi.unstubAllGlobals().
 *
 * Like the real one, an observer reports the current state as soon as it
 * observes an element, but only when that is "in view", and synchronously.
 * `setIntersecting` changes the state and calls every observer that is still
 * connected at that moment, including ones created since the last call.
 */
export function stubIntersectionObserver() {
  let intersecting = false
  const observers: StubObserver[] = []
  const connected = new Set<IntersectionObserverStub>()

  class IntersectionObserverStub implements StubObserver {
    readonly root = null
    readonly rootMargin: string
    readonly scrollMargin = '0px'
    readonly thresholds: readonly number[]
    readonly elements = new Set<Element>()
    disconnected = false
    readonly options: IntersectionObserverInit | undefined
    private readonly callback: IntersectionObserverCallback

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      this.callback = callback
      this.options = options
      this.rootMargin = options?.rootMargin ?? '0px 0px 0px 0px'
      this.thresholds = [options?.threshold ?? 0].flat()
      observers.push(this)
      connected.add(this)
    }

    observe(target: Element) {
      this.elements.add(target)
      if (intersecting) this.report([target])
    }

    unobserve(target: Element) {
      this.elements.delete(target)
    }

    disconnect() {
      this.elements.clear()
      connected.delete(this)
      this.disconnected = true
    }

    takeRecords() {
      return []
    }

    report(targets: Iterable<Element>) {
      const entries = [...targets].map((target) => entry(target, intersecting))
      if (entries.length > 0) this.callback(entries, this)
    }
  }

  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

  function setIntersecting(isIntersecting: boolean) {
    intersecting = isIntersecting
    act(() => {
      // A copy, because a callback can disconnect or create observers.
      for (const observer of [...connected]) observer.report(observer.elements)
    })
  }

  return { setIntersecting, observers }
}
