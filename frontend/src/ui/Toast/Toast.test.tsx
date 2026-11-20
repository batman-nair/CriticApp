import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useRef, useState, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { Toast } from './Toast'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

type Props = Partial<ComponentProps<typeof Toast>>

function renderToast(props: Props = {}) {
  const onClose = vi.fn()
  const ui = (next: Props) => (
    <Toast open onClose={onClose} {...props} {...next}>
      {next.children ?? props.children ?? 'Removed Dune.'}
    </Toast>
  )
  const view = render(ui({}))
  return { onClose, rerender: (next: Props) => view.rerender(ui(next)) }
}

it('shows the message in a status region, with the action', async () => {
  const onClick = vi.fn()
  renderToast({ action: { label: 'Undo', onClick } })

  expect(screen.getByRole('status')).toHaveTextContent('Removed Dune.')
  await user().click(screen.getByRole('button', { name: 'Undo' }))
  expect(onClick).toHaveBeenCalledOnce()
})

it('keeps an empty status region in the page while closed', () => {
  const { rerender } = renderToast({ open: false })

  expect(screen.getByRole('status')).toBeEmptyDOMElement()

  rerender({ open: true, children: 'Removed Arrival.' })
  expect(screen.getByRole('status')).toHaveTextContent('Removed Arrival.')
})

it('has no action button without an action', () => {
  renderToast()

  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

describe('timer', () => {
  it('closes after 6 seconds, not before', () => {
    const { onClose } = renderToast()

    wait(5999)
    expect(onClose).not.toHaveBeenCalled()
    wait(1)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('takes another duration', () => {
    const { onClose } = renderToast({ duration: 1000 })

    wait(1000)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('starts again for a new message', () => {
    const { onClose, rerender } = renderToast({ messageKey: 1 })

    wait(5000)
    rerender({ messageKey: 2 })
    wait(5000)
    expect(onClose).not.toHaveBeenCalled()
    wait(1000)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('doesn’t run while closed', () => {
    const { onClose } = renderToast({ open: false })

    wait(10000)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('pauses while hovered, and restarts in full after', () => {
    const { onClose } = renderToast()
    const toast = screen.getByText('Removed Dune.').parentElement!

    wait(5000)
    fireEvent.pointerEnter(toast)
    wait(10000)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerLeave(toast)
    wait(5999)
    expect(onClose).not.toHaveBeenCalled()
    wait(1)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('pauses while focus is inside, and restarts in full after', () => {
    const { onClose } = renderToast({
      action: { label: 'Undo', onClick: () => {} },
    })

    wait(5000)
    act(() => screen.getByRole('button', { name: 'Undo' }).focus())
    wait(10000)
    expect(onClose).not.toHaveBeenCalled()

    act(() => screen.getByRole('button', { name: 'Undo' }).blur())
    wait(5999)
    expect(onClose).not.toHaveBeenCalled()
    wait(1)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('isn’t paused by a hover left over from before it closed', () => {
    const { onClose, rerender } = renderToast({ messageKey: 1 })
    fireEvent.pointerEnter(screen.getByText('Removed Dune.').parentElement!)

    rerender({ open: false })
    rerender({ open: true, messageKey: 2 })
    wait(6000)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

it('closes on Escape with focus inside', async () => {
  const { onClose } = renderToast({
    action: { label: 'Undo', onClick: () => {} },
  })

  act(() => screen.getByRole('button', { name: 'Undo' }).focus())
  await user().keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()
})

it('hands the action button to actionRef', () => {
  const actionRef = createRef<HTMLButtonElement>()
  renderToast({ action: { label: 'Undo', onClick: () => {} }, actionRef })

  expect(actionRef.current).toBe(screen.getByRole('button', { name: 'Undo' }))
})

describe('returning focus', () => {
  function Harness({ withAction = true }: { withAction?: boolean }) {
    const [open, setOpen] = useState(true)
    const [key, setKey] = useState(1)
    const backRef = useRef<HTMLDivElement>(null)
    return (
      <>
        <div ref={backRef} tabIndex={-1}>
          results
        </div>
        <button type="button" onClick={() => setKey((k) => k + 1)}>
          Next
        </button>
        <Toast
          open={open}
          messageKey={key}
          onClose={() => setOpen(false)}
          returnFocusRef={backRef}
          action={
            withAction && key === 1
              ? { label: 'Undo', onClick: () => setOpen(false) }
              : undefined
          }
        >
          Message {key}
        </Toast>
      </>
    )
  }

  it('moves focus to returnFocusRef when it closes with focus inside', async () => {
    render(<Harness />)

    act(() => screen.getByRole('button', { name: 'Undo' }).focus())
    await user().keyboard('{Enter}')

    expect(screen.getByText('results')).toHaveFocus()
  })

  it('does so when a new message drops the focused action', async () => {
    render(<Harness />)

    act(() => screen.getByRole('button', { name: 'Undo' }).focus())
    // Not through the Next button, which would take focus first.
    act(() => screen.getByRole('button', { name: 'Next' }).click())

    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(screen.getByText('results')).toHaveFocus()
  })

  it('leaves focus alone when it was elsewhere', () => {
    render(<Harness />)
    const next = screen.getByRole('button', { name: 'Next' })

    act(() => next.focus())
    act(() => next.click())

    expect(next).toHaveFocus()
  })
})

it('has no axe violations', async () => {
  vi.useRealTimers()
  const { container } = render(
    <Toast
      open
      onClose={() => {}}
      action={{ label: 'Undo', onClick: () => {} }}
    >
      Removed <strong>Dune</strong> from your watchlist.
    </Toast>,
  )

  await expectNoAxeViolations(container)
})
