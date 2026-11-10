import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { RulerPicker } from './RulerPicker'

const NAME = 'Your rating'

function Harness({
  initial,
  onChange,
}: {
  initial: number
  onChange: (value: number) => void
}) {
  const [value, setValue] = useState(initial)

  return (
    <RulerPicker
      label={NAME}
      category="movie"
      value={value}
      onChange={(next) => {
        onChange(next)
        setValue(next)
      }}
    />
  )
}

function setup(initial = 5) {
  const onChange = vi.fn()
  const { container } = render(
    <Harness initial={initial} onChange={onChange} />,
  )
  return {
    onChange,
    container,
    slider: screen.getByRole('slider', { name: NAME }),
  }
}

const shown = () => screen.getByText('/10').parentElement
const liveRegion = (container: HTMLElement) =>
  container.querySelector('[aria-live="polite"]')
const lower = () => screen.getByRole('button', { name: 'Lower by 0.1' })
const raise = () => screen.getByRole('button', { name: 'Raise by 0.1' })

function focusSlider(slider: HTMLElement) {
  act(() => slider.focus())
}

/** Fires a wheel event and returns whether it was default-prevented. */
function wheel(slider: HTMLElement, init: WheelEventInit) {
  return !fireEvent.wheel(slider, init)
}

function scrollTo(slider: HTMLElement, left: number) {
  slider.scrollLeft = left
  fireEvent.scroll(slider)
}

function mouseDown(slider: HTMLElement, clientX: number) {
  fireEvent.pointerDown(slider, {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX,
  })
}

function pointerMove(slider: HTMLElement, clientX: number) {
  fireEvent.pointerMove(slider, { pointerId: 1, buttons: 1, clientX })
}

describe('keyboard', () => {
  it.each([
    ['ArrowRight', 5.1],
    ['ArrowLeft', 4.9],
    ['PageUp', 6],
    ['PageDown', 4],
    ['Home', 0],
    ['End', 10],
  ])('%s moves to %d and prevents the default', (key, expected) => {
    const { onChange, slider } = setup()

    expect(fireEvent.keyDown(slider, { key })).toBe(false)

    expect(onChange).toHaveBeenCalledExactlyOnceWith(expected)
    expect(slider).toHaveAttribute('aria-valuenow', String(expected))
  })

  it.each([
    [0, 'ArrowLeft'],
    [0, 'PageDown'],
    [0, 'Home'],
    [10, 'ArrowRight'],
    [10, 'PageUp'],
    [10, 'End'],
  ])('stays at %d on %s without calling onChange', (initial, key) => {
    const { onChange, slider } = setup(initial)

    expect(fireEvent.keyDown(slider, { key })).toBe(false)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps a large step that would pass the limit', () => {
    const { onChange, slider } = setup(9.5)

    fireEvent.keyDown(slider, { key: 'PageUp' })

    expect(onChange).toHaveBeenCalledExactlyOnceWith(10)
  })

  it.each(['ctrlKey', 'altKey', 'metaKey'])(
    'ignores %s + arrow',
    (modifier) => {
      const { onChange, slider } = setup()

      expect(
        fireEvent.keyDown(slider, { key: 'ArrowRight', [modifier]: true }),
      ).toBe(true)

      expect(onChange).not.toHaveBeenCalled()
    },
  )

  it('leaves other keys alone', () => {
    const { onChange, slider } = setup()

    expect(fireEvent.keyDown(slider, { key: 'a' })).toBe(true)

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('buttons', () => {
  it('step by 0.1 from a mid value', async () => {
    const user = userEvent.setup()
    const { onChange } = setup(7.5)

    await user.click(raise())
    expect(onChange).toHaveBeenLastCalledWith(7.6)

    await user.click(lower())
    await user.click(lower())
    expect(onChange).toHaveBeenLastCalledWith(7.4)
  })

  it.each([
    [0, lower],
    [10, raise],
  ])('stay enabled at %d and do nothing', async (initial, button) => {
    const user = userEvent.setup()
    const { onChange, container } = setup(initial)

    expect(button()).toBeEnabled()
    await user.click(button())

    expect(onChange).not.toHaveBeenCalled()
    expect(liveRegion(container)).toHaveTextContent('')
  })

  it('announce the new value in the live region', async () => {
    const user = userEvent.setup()
    const { container } = setup(7.5)
    expect(liveRegion(container)).toHaveTextContent('')

    await user.click(raise())

    expect(liveRegion(container)).toHaveTextContent('7.6 out of 10')
  })

  it('are not announced for scrolling or keys', () => {
    const { container, slider } = setup(7.5)

    scrollTo(slider, 906)
    fireEvent.keyDown(slider, { key: 'ArrowRight' })

    expect(liveRegion(container)).toHaveTextContent('')
  })
})

describe('rounding', () => {
  it('adds tenths without float drift', async () => {
    const user = userEvent.setup()
    const { onChange } = setup(0.1)

    await user.click(raise())
    await user.click(raise())

    expect(onChange).toHaveBeenLastCalledWith(0.3)
    expect(shown()).toHaveTextContent('0.3/10')
  })

  it('shows a drifted value rounded', () => {
    setup(0.1 + 0.2)

    expect(shown()).toHaveTextContent('0.3/10')
  })

  it('shows two decimals the way RatingBadge does, without calling onChange', () => {
    const { onChange, slider } = setup(7.55)

    expect(shown()).toHaveTextContent('7.5/10')
    expect(slider).toHaveAttribute('aria-valuenow', '7.5')
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([
    [11, '10.0/10', '10'],
    [-1, '0.0/10', '0'],
  ])('clamps %d for display and ARIA', (initial, text, now) => {
    const { slider } = setup(initial)

    expect(shown()).toHaveTextContent(text)
    expect(slider).toHaveAttribute('aria-valuenow', now)
  })
})

describe('ARIA', () => {
  it('exposes a named slider with its value', () => {
    const { slider } = setup(7.5)

    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '10')
    expect(slider).toHaveAttribute('aria-valuenow', '7.5')
    expect(slider).toHaveAttribute('aria-valuetext', '7.5 out of 10')
  })

  it('updates after a change', () => {
    const { slider } = setup(7.5)

    fireEvent.keyDown(slider, { key: 'ArrowRight' })

    expect(slider).toHaveAttribute('aria-valuenow', '7.6')
    expect(slider).toHaveAttribute('aria-valuetext', '7.6 out of 10')
  })

  it('hides the visible number from assistive tech', () => {
    setup()

    expect(shown()).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('scroll position', () => {
  it('starts at the value', () => {
    const { slider } = setup(5)

    expect(slider.scrollLeft).toBe(600)
  })

  it('follows a parent change without calling onChange', () => {
    const onChange = vi.fn()
    const element = (value: number) => (
      <RulerPicker
        label={NAME}
        category="movie"
        value={value}
        onChange={onChange}
      />
    )
    const { rerender } = render(element(5))

    rerender(element(7))

    expect(screen.getByRole('slider').scrollLeft).toBe(840)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports a scroll in tenths and leaves the position alone', () => {
    const { onChange, slider } = setup(7.5)

    scrollTo(slider, 906)

    expect(onChange).toHaveBeenCalledExactlyOnceWith(7.6)
    expect(slider.scrollLeft).toBe(906)
    expect(shown()).toHaveTextContent('7.6/10')
  })

  it('ignores a scroll event at the current position', () => {
    const { onChange, slider } = setup(7.5)

    scrollTo(slider, 900)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps a scroll past the end', () => {
    const { onChange, slider } = setup(9.9)

    scrollTo(slider, 1300)

    expect(onChange).toHaveBeenCalledExactlyOnceWith(10)
  })

  it('calls the latest onChange', () => {
    const first = vi.fn()
    const second = vi.fn()
    const element = (onChange: (value: number) => void) => (
      <RulerPicker
        label={NAME}
        category="movie"
        value={5}
        onChange={onChange}
      />
    )
    const { rerender } = render(element(first))

    rerender(element(second))
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledExactlyOnceWith(5.1)
  })

  it('moves the scroller for a key press', () => {
    const { slider } = setup(5)

    fireEvent.keyDown(slider, { key: 'ArrowRight' })

    expect(slider.scrollLeft).toBe(612)
  })
})

describe('mouse drag', () => {
  it('moves by whole tenths against the pointer', () => {
    const { onChange, slider } = setup(5)

    mouseDown(slider, 200)
    pointerMove(slider, 176)

    expect(onChange).toHaveBeenCalledExactlyOnceWith(5.2)
    expect(slider.scrollLeft).toBe(624)
  })

  it.each(['pointerUp', 'pointerCancel'] as const)(
    'stops on %s',
    (endEvent) => {
      const { onChange, slider } = setup(5)

      mouseDown(slider, 200)
      fireEvent[endEvent](slider, { pointerId: 1 })
      pointerMove(slider, 100)

      expect(onChange).not.toHaveBeenCalled()
    },
  )

  it('stops when a move arrives with the button already released', () => {
    const { onChange, slider } = setup(5)

    mouseDown(slider, 200)
    fireEvent.pointerMove(slider, { pointerId: 1, buttons: 0, clientX: 100 })
    pointerMove(slider, 100)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores a move with no drag in progress', () => {
    const { onChange, slider } = setup(5)

    pointerMove(slider, 100)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves touch to the browser', () => {
    const { onChange, slider } = setup(5)

    fireEvent.pointerDown(slider, {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 200,
    })
    pointerMove(slider, 100)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores a non-primary button', () => {
    const { onChange, slider } = setup(5)

    fireEvent.pointerDown(slider, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 2,
      clientX: 200,
    })
    pointerMove(slider, 100)

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('wheel with focus', () => {
  it('steps by 0.1 per 100px and prevents the default', () => {
    const { onChange, slider } = setup(5)
    focusSlider(slider)

    expect(wheel(slider, { deltaY: 100 })).toBe(true)

    expect(onChange).toHaveBeenCalledExactlyOnceWith(5.1)
  })

  it('lowers on a negative delta', () => {
    const { onChange, slider } = setup(5)
    focusSlider(slider)

    wheel(slider, { deltaY: -100 })

    expect(onChange).toHaveBeenCalledExactlyOnceWith(4.9)
  })

  it('adds up small deltas', () => {
    const { onChange, slider } = setup(5)
    focusSlider(slider)

    wheel(slider, { deltaY: 50 })
    expect(onChange).not.toHaveBeenCalled()

    wheel(slider, { deltaY: 50 })
    expect(onChange).toHaveBeenCalledExactlyOnceWith(5.1)
  })

  it('resets the sum when the direction changes', () => {
    const { onChange, slider } = setup(5)
    focusSlider(slider)

    wheel(slider, { deltaY: 50 })
    wheel(slider, { deltaY: -50 })
    wheel(slider, { deltaY: 50 })
    expect(onChange).not.toHaveBeenCalled()

    // Would add up to 100 without the reset.
    wheel(slider, { deltaY: -10 })
    wheel(slider, { deltaY: 60 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('steps once per event in line mode', () => {
    const { onChange, slider } = setup(5)
    focusSlider(slider)

    wheel(slider, { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE })

    expect(onChange).toHaveBeenCalledExactlyOnceWith(5.1)
  })

  it('leaves horizontal-dominant events to the browser', () => {
    const { onChange, slider } = setup(5)
    focusSlider(slider)

    expect(wheel(slider, { deltaX: 100, deltaY: 10 })).toBe(false)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves pinch zoom to the browser', () => {
    const { onChange, slider } = setup(5)
    focusSlider(slider)

    expect(wheel(slider, { deltaY: 100, ctrlKey: true })).toBe(false)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('lets the page scroll at the limit', () => {
    const { onChange, slider } = setup(10)
    focusSlider(slider)

    expect(wheel(slider, { deltaY: 100 })).toBe(false)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('forgets the sum on reaching the limit', () => {
    const { onChange, slider } = setup(9.9)
    focusSlider(slider)

    wheel(slider, { deltaY: 150 })
    expect(onChange).toHaveBeenCalledExactlyOnceWith(10)

    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    onChange.mockClear()

    wheel(slider, { deltaY: 50 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('forgets the sum when a wheel event finds it already at the limit', () => {
    const { onChange, slider } = setup(9.9)
    focusSlider(slider)

    wheel(slider, { deltaY: 50 })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    wheel(slider, { deltaY: 50 })
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    onChange.mockClear()

    wheel(slider, { deltaY: 50 })
    expect(onChange).not.toHaveBeenCalled()
  })
})

it('leaves the wheel to the page without focus', () => {
  const { onChange, slider } = setup(5)

  expect(wheel(slider, { deltaY: 100 })).toBe(false)

  expect(onChange).not.toHaveBeenCalled()
})

describe('layouts', () => {
  it('shows labelAside on the stacked layout', () => {
    render(
      <RulerPicker
        layout="stacked"
        label={NAME}
        category="movie"
        value={5}
        onChange={() => {}}
        labelAside={<span>IMDb 8.0</span>}
      />,
    )

    expect(screen.getByText('IMDb 8.0')).toBeInTheDocument()
  })

  it('applies the category variables', () => {
    const { container } = render(
      <RulerPicker
        label={NAME}
        category="game"
        value={5}
        onChange={() => {}}
      />,
    )

    expect(
      (container.firstChild as HTMLElement).style.getPropertyValue('--cat'),
    ).toBe('var(--cat-game)')
  })

  it('has no axe violations in either layout', async () => {
    const { container } = render(
      <>
        <RulerPicker
          label="Inline rating"
          category="movie"
          value={5}
          onChange={() => {}}
        />
        <RulerPicker
          layout="stacked"
          label="Stacked rating"
          category="game"
          value={7.5}
          onChange={() => {}}
          labelAside={<span>IMDb 8.0</span>}
        />
      </>,
    )

    await expectNoAxeViolations(container)
  })
})
