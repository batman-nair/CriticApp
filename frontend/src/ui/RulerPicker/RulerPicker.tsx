import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { categoryVars } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { Icon } from '../Icon/Icon'
import { IconButton } from '../IconButton/IconButton'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './RulerPicker.module.css'

const STEP_PX = 12
const MAX_TENTHS = 100
const TENTHS_PER_UNIT = 10
const WHEEL_PX_PER_STEP = 100

interface BaseProps {
  value: number
  onChange: (value: number) => void
  label: string
  category: string
}

type RulerPickerProps =
  | (BaseProps & { layout?: 'inline' })
  | (BaseProps & { layout: 'stacked'; labelAside?: ReactNode })

interface Drag {
  pointerId: number
  startX: number
  startTenths: number
}

function clampTenths(tenths: number) {
  return Math.min(MAX_TENTHS, Math.max(0, tenths))
}

// Through toFixed so that it rounds like RatingBadge: 7.55 is 7.5 in both.
function toTenths(value: number) {
  return clampTenths(Math.round(Number(value.toFixed(1)) * TENTHS_PER_UNIT))
}

function toValue(tenths: number) {
  return tenths / TENTHS_PER_UNIT
}

function formatTenths(tenths: number) {
  return toValue(tenths).toFixed(1)
}

function describeTenths(tenths: number) {
  return `${formatTenths(tenths)} out of 10`
}

function keyTarget(key: string, from: number) {
  switch (key) {
    case 'ArrowLeft':
      return from - 1
    case 'ArrowRight':
      return from + 1
    case 'PageDown':
      return from - TENTHS_PER_UNIT
    case 'PageUp':
      return from + TENTHS_PER_UNIT
    case 'Home':
      return 0
    case 'End':
      return MAX_TENTHS
    default:
      return null
  }
}

function tickClass(index: number) {
  if (index % 10 === 0) return styles.major
  if (index % 5 === 0) return styles.middle
  return styles.minor
}

// Built once, so a value change never re-renders the 101 ticks.
const TICKS = Array.from({ length: MAX_TENTHS + 1 }, (_, index) => (
  <span key={index} className={styles.tick}>
    <span className={cx(styles.line, tickClass(index))} />
    {index % 10 === 0 && (
      <span className={styles.tickLabel}>{index / TENTHS_PER_UNIT}</span>
    )}
  </span>
))

export function RulerPicker(props: RulerPickerProps) {
  const { value, onChange, label, category, layout = 'inline' } = props
  const labelAside = props.layout === 'stacked' ? props.labelAside : undefined

  const labelId = useId()
  const tenths = toTenths(value)
  const [announcement, setAnnouncement] = useState('')

  const scrollerRef = useRef<HTMLDivElement>(null)
  // The tenths this component last saw or asked for. Null until positioned.
  const currentRef = useRef<number | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useLayoutEffect(() => {
    // An echo of our own onChange. Writing here would fight a finger or fling.
    if (tenths === currentRef.current) return
    currentRef.current = tenths
    if (scrollerRef.current) scrollerRef.current.scrollLeft = tenths * STEP_PX
  }, [tenths])

  // Always instant: a smooth scroll reports in-between positions through
  // handleScroll, which would overwrite the value and lose fast presses.
  const moveTo = useCallback((target: number) => {
    const next = clampTenths(target)
    if (next === currentRef.current) return false
    currentRef.current = next
    if (scrollerRef.current) scrollerRef.current.scrollLeft = next * STEP_PX
    onChangeRef.current(toValue(next))
    return true
  }, [])

  function handleScroll() {
    const scroller = scrollerRef.current
    if (!scroller) return
    const next = clampTenths(Math.round(scroller.scrollLeft / STEP_PX))
    if (next === currentRef.current) return
    currentRef.current = next
    onChangeRef.current(toValue(next))
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (currentRef.current === null) return
    const target = keyTarget(event.key, currentRef.current)
    if (target === null) return
    event.preventDefault()
    moveTo(target)
  }

  function nudge(delta: number) {
    if (currentRef.current === null) return
    const target = currentRef.current + delta
    if (moveTo(target)) setAnnouncement(describeTenths(clampTenths(target)))
  }

  // Touch and pen stay native, so they keep scrolling, momentum and snapping.
  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    if (currentRef.current === null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startTenths: currentRef.current,
    }
  }

  function handlePointerMove(event: PointerEvent) {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    moveTo(
      drag.startTenths + Math.round((drag.startX - event.clientX) / STEP_PX),
    )
  }

  function endDrag(event: PointerEvent) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  // Native because React's onWheel is passive and can't preventDefault.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    let accumulated = 0

    function handleWheel(event: WheelEvent) {
      if (event.ctrlKey) return
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      if (document.activeElement !== scroller) return
      const from = currentRef.current
      if (from === null) return

      const direction = Math.sign(event.deltaY)
      // Already at the limit: let the page scroll instead.
      if (clampTenths(from + direction) === from) {
        accumulated = 0
        return
      }
      event.preventDefault()

      let steps = direction
      if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
        if (Math.sign(accumulated) === -direction) accumulated = 0
        accumulated += event.deltaY
        steps = Math.trunc(accumulated / WHEEL_PX_PER_STEP)
        accumulated -= steps * WHEEL_PX_PER_STEP
      }
      if (steps === 0) return

      moveTo(from + steps)
      const landed = currentRef.current
      if (landed === 0 || landed === MAX_TENTHS) accumulated = 0
    }

    scroller.addEventListener('wheel', handleWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', handleWheel)
  }, [moveTo])

  const labelElement = (
    <span id={labelId} className={styles.label}>
      {label}
    </span>
  )
  // Hidden because the slider's aria-valuetext and the live region announce it.
  const number = (
    <span className={styles.number} aria-hidden="true">
      {formatTenths(tenths)}
      <span className={styles.scale}>/10</span>
    </span>
  )

  return (
    <div
      className={cx(styles.root, styles[layout])}
      style={categoryVars(category)}
    >
      {layout === 'inline' ? (
        <div className={styles.header}>
          {labelElement}
          {number}
        </div>
      ) : (
        <>
          <div className={styles.header}>
            {labelElement}
            {labelAside}
          </div>
          {number}
        </>
      )}

      <div className={styles.ruler}>
        <IconButton
          variant="outline"
          size="md"
          label="Lower by 0.1"
          className={styles.nudge}
          onClick={() => nudge(-1)}
        >
          <Icon name="chevron-left" size={18} />
        </IconButton>

        <div className={styles.track}>
          <div
            ref={scrollerRef}
            className={styles.scroller}
            role="slider"
            tabIndex={0}
            aria-labelledby={labelId}
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={toValue(tenths)}
            aria-valuetext={describeTenths(tenths)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className={styles.spacer} />
            <span className={styles.ticks} aria-hidden="true">
              {TICKS}
            </span>
            <span className={styles.spacer} />
          </div>
          <span
            className={cx(styles.fade, styles.fadeStart)}
            aria-hidden="true"
          />
          <span
            className={cx(styles.fade, styles.fadeEnd)}
            aria-hidden="true"
          />
          <span className={styles.indicator} aria-hidden="true" />
          {/* Focus stays on a pressed button, so the slider isn't announced. */}
          <span aria-live="polite">
            <VisuallyHidden>{announcement}</VisuallyHidden>
          </span>
        </div>

        <IconButton
          variant="outline"
          size="md"
          label="Raise by 0.1"
          className={styles.nudge}
          onClick={() => nudge(1)}
        >
          <Icon name="chevron-right" size={18} />
        </IconButton>
      </div>
    </div>
  )
}
