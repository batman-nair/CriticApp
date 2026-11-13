import { useRef, type PointerEvent, type RefObject } from 'react'

/** The sheet layout. Must match the breakpoint in Dialog.module.css. */
export const SHEET_QUERY = '(max-width: 639px)'
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Movement that still counts as a tap, not a drag. */
const SLOP_PX = 6
/** Downward speed that closes the sheet whatever the distance. */
const FLICK_PX_PER_MS = 0.5
/** A flick has to end in a release, not a pause. */
const FLICK_MAX_AGE_MS = 100

const INTERACTIVE = 'button, a, input, select, textarea, [role="button"]'

interface Sample {
  y: number
  time: number
}

interface Drag {
  pointerId: number
  startY: number
  height: number
  reducedMotion: boolean
  dragging: boolean
  /** Where the sheet was when the drag began, if a spring-back hadn't ended. */
  offset: number
  dy: number
  previous: Sample
  last: Sample
}

/** How far down a spring-back has got, read from the running transition. */
function currentOffset(sheet: HTMLElement) {
  if (!sheet.style.transition) return 0
  const matrix = /^matrix\((.+)\)$/.exec(getComputedStyle(sheet).transform)
  const y = matrix ? Number(matrix[1]!.split(',')[5]) : 0
  return Number.isFinite(y) && y > 0 ? y : 0
}

/**
 * Drags the sheet down by the zones the handlers are spread on, and closes it
 * past a third of its height or on a downward flick. Phone layout only.
 * Without `onClose` it still drags, and always springs back.
 */
export function useSheetDrag(
  sheetRef: RefObject<HTMLElement | null>,
  onClose: (() => void) | undefined,
) {
  const dragRef = useRef<Drag | null>(null)

  function springBack(drag: Drag) {
    const sheet = sheetRef.current
    // With reduced motion the sheet never moved.
    if (!sheet || drag.reducedMotion) return
    // global.css cuts this to nothing under prefers-reduced-motion.
    sheet.style.transition = 'transform var(--duration-medium) var(--ease)'
    sheet.style.transform = ''
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    // A second finger doesn't take over the drag.
    if (event.button !== 0 || dragRef.current) return
    // Before matchMedia, which jsdom lacks: ‹ ›, Close and the like just click.
    if (event.target instanceof Element && event.target.closest(INTERACTIVE)) {
      return
    }
    const sheet = sheetRef.current
    if (!sheet || !window.matchMedia(SHEET_QUERY).matches) return

    event.currentTarget.setPointerCapture(event.pointerId)
    const start = { y: event.clientY, time: performance.now() }
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      height: sheet.getBoundingClientRect().height,
      reducedMotion: window.matchMedia(REDUCED_MOTION_QUERY).matches,
      dragging: false,
      offset: 0,
      dy: 0,
      previous: start,
      last: start,
    }
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    // The release can go missing, e.g. when it happens outside the window.
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      cancel(drag)
      return
    }

    const moved = event.clientY - drag.startY
    drag.previous = drag.last
    drag.last = { y: event.clientY, time: performance.now() }

    const sheet = sheetRef.current
    if (!drag.dragging) {
      if (moved <= SLOP_PX) return
      drag.dragging = true
      if (sheet) {
        // Pick the sheet up where it is, then stop the spring-back.
        drag.offset = currentOffset(sheet)
        sheet.style.transition = ''
      }
    }
    // Never above the open position.
    drag.dy = Math.max(0, drag.offset + moved)
    if (sheet && !drag.reducedMotion) {
      sheet.style.transform = `translateY(${drag.dy}px)`
    }
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (!drag.dragging) return

    // A zero height (no layout) never reaches the distance; only a flick can.
    const far = drag.height > 0 && drag.dy >= drag.height / 3
    const { previous, last } = drag
    const elapsed = last.time - previous.time
    const speed = elapsed > 0 ? (last.y - previous.y) / elapsed : 0
    const flick =
      drag.dy > SLOP_PX &&
      speed >= FLICK_PX_PER_MS &&
      performance.now() - last.time <= FLICK_MAX_AGE_MS

    if (onClose && (far || flick)) {
      // The transform stays: sheet-out has only a `to`, so the exit starts here.
      onClose()
    } else {
      springBack(drag)
    }
  }

  function cancel(drag: Drag) {
    dragRef.current = null
    if (drag.dragging) springBack(drag)
  }

  function onPointerCancel(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (drag?.pointerId === event.pointerId) cancel(drag)
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}
