import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import {
  finishExitAnimation,
  settle,
  stubExitAnimation,
} from '../../test/dialogAnimation'
import { stubMediaQueries } from '../../test/matchMedia'
import { Dialog } from './Dialog'
import styles from './Dialog.module.css'
import { REDUCED_MOTION_QUERY, SHEET_QUERY } from './useSheetDrag'

afterEach(() => {
  vi.restoreAllMocks()
})

type HarnessProps = Partial<Omit<ComponentProps<typeof Dialog>, 'open'>>

function Harness({ children, ...props }: HarnessProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog title="Details" open={open} onOpenChange={setOpen} {...props}>
        {children ?? <button type="button">Inside</button>}
      </Dialog>
    </>
  )
}

const opener = () => screen.getByRole('button', { name: 'Open' })
const dialog = () => screen.getByRole('dialog')

async function setup(props?: HarnessProps) {
  const user = userEvent.setup()
  const view = render(<Harness {...props} />)
  await user.click(opener())
  await screen.findByRole('dialog')
  return { user, ...view }
}

const closers: [string, (user: UserEvent) => Promise<void>][] = [
  ['Esc', (user) => user.keyboard('{Escape}')],
  ['the overlay', (user) => user.click(dialog().previousElementSibling!)],
  [
    'the Close button',
    (user) => user.click(screen.getByRole('button', { name: 'Close' })),
  ],
]

it('renders nothing while closed', () => {
  render(<Harness />)

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it.each(closers)('closes with %s and returns focus', async (_, close) => {
  const { user } = await setup()

  await close(user)

  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  await waitFor(() => expect(opener()).toHaveFocus())
})

it('moves focus inside on open and keeps it there', async () => {
  const { user } = await setup()
  expect(dialog()).toContainElement(document.activeElement as HTMLElement)

  for (let press = 0; press < 5; press += 1) {
    await user.tab()
    expect(dialog()).toContainElement(document.activeElement as HTMLElement)
  }
  for (let press = 0; press < 5; press += 1) {
    await user.tab({ shift: true })
    expect(dialog()).toContainElement(document.activeElement as HTMLElement)
  }
})

it('returns focus when a child took it with autoFocus', async () => {
  const { user } = await setup({
    children: <input aria-label="Search" autoFocus />,
  })
  expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus()

  await user.keyboard('{Escape}')

  await waitFor(() => expect(opener()).toHaveFocus())
})

it('is named by a visible title', async () => {
  await setup()

  expect(screen.getByRole('dialog', { name: 'Details' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Details' })).toBeInTheDocument()
})

it('is named by a hidden title, with no heading', async () => {
  await setup({ hideTitle: true })

  expect(screen.getByRole('dialog', { name: 'Details' })).toBeInTheDocument()
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
})

it('locks the page scroll only while open', async () => {
  const { user } = await setup()
  expect(document.body).toHaveAttribute('data-scroll-locked')

  await user.keyboard('{Escape}')

  await waitFor(() =>
    expect(document.body).not.toHaveAttribute('data-scroll-locked'),
  )
})

it('renders each slot, with Close after the header actions', async () => {
  await setup({
    headerStart: <span>Stepper</span>,
    headerEnd: <button type="button">Edit</button>,
    footer: <span>Footer</span>,
    children: <p>Body</p>,
  })

  const scope = within(dialog())
  expect(scope.getByText('Stepper')).toBeInTheDocument()
  expect(scope.getByText('Body')).toBeInTheDocument()
  expect(scope.getByText('Footer')).toBeInTheDocument()
  expect(scope.getAllByRole('button')).toEqual([
    scope.getByRole('button', { name: 'Edit' }),
    scope.getByRole('button', { name: 'Close' }),
  ])
})

it('leaves out Close with hideClose, keeping the header actions', async () => {
  await setup({
    headerEnd: <button type="button">Cancel</button>,
    hideClose: true,
    children: <p>Body</p>,
  })

  const scope = within(dialog())
  expect(scope.getAllByRole('button')).toEqual([
    scope.getByRole('button', { name: 'Cancel' }),
  ])
})

it('has no footer wrapper without a footer', async () => {
  await setup({ children: <p>Body</p> })

  expect(dialog().getElementsByClassName(styles.footer!)).toHaveLength(0)
})

it('makes the body keyboard-focusable', async () => {
  await setup({ children: <p>Body</p> })

  expect(screen.getByText('Body').parentElement).toHaveAttribute(
    'tabindex',
    '0',
  )
})

it('starts a new body, scrolled to the top, when bodyKey changes', async () => {
  const { rerender } = await setup({ bodyKey: 1, children: <p>Body</p> })
  const body = screen.getByText('Body').parentElement!
  body.scrollTop = 120

  rerender(
    <Harness bodyKey={1}>
      <p>Body</p>
    </Harness>,
  )
  expect(screen.getByText('Body').parentElement).toBe(body)

  rerender(
    <Harness bodyKey={2}>
      <p>Body</p>
    </Harness>,
  )

  const next = screen.getByText('Body').parentElement!
  expect(next).not.toBe(body)
  expect(next.scrollTop).toBe(0)
  expect(dialog()).toContainElement(next)
})

it('sets the category variables on the dialog', async () => {
  await setup({ category: 'movie' })

  expect(dialog().style.getPropertyValue('--cat-base')).toBe(
    'var(--cat-movie-base)',
  )
  expect(Array.from(dialog().classList)).toContain(styles.tinted)
})

it('has no tint without a category', async () => {
  await setup()

  expect(Array.from(dialog().classList)).not.toContain(styles.tinted)
})

it('calls onExited once after closing', async () => {
  const onExited = vi.fn()
  const { user } = await setup({ onExited })

  await user.keyboard('{Escape}')

  await waitFor(() => expect(onExited).toHaveBeenCalledOnce())
  await settle()
  expect(onExited).toHaveBeenCalledOnce()
})

it('waits for the exit animation before onExited', async () => {
  stubExitAnimation()
  const onExited = vi.fn()
  const { user } = await setup({ onExited })

  await user.keyboard('{Escape}')
  const closing = dialog()
  expect(closing).toHaveAttribute('data-state', 'closed')
  await settle()
  expect(onExited).not.toHaveBeenCalled()

  finishExitAnimation(closing)

  await waitFor(() => expect(onExited).toHaveBeenCalledOnce())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('does not call onExited when unmounted while open', async () => {
  const onExited = vi.fn()
  const { unmount } = await setup({ onExited })

  unmount()
  await settle()

  expect(onExited).not.toHaveBeenCalled()
})

it('does not call onExited when unmounted during the exit', async () => {
  stubExitAnimation()
  const onExited = vi.fn()
  const { user, unmount } = await setup({ onExited })

  await user.keyboard('{Escape}')
  unmount()
  await settle()

  expect(onExited).not.toHaveBeenCalled()
})

it('does not call onExited for a dialog that never opened', async () => {
  const onExited = vi.fn()
  const { unmount } = render(<Harness onExited={onExited} />)

  unmount()
  await settle()

  expect(onExited).not.toHaveBeenCalled()
})

it('has no axe violations', async () => {
  await setup({ footer: <span>Footer</span> })

  // Not document.body: axe's region rule misfires on portaled content.
  await expectNoAxeViolations(dialog())
})

describe('drag to close', () => {
  const START_Y = 100
  const HEIGHT = 600

  beforeEach(() => {
    stubMediaQueries([SHEET_QUERY])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const handle = () => dialog().getElementsByClassName(styles.handle!)[0]!
  const title = () => screen.getByRole('heading', { name: 'Details' })

  async function setupSheet(props?: HarnessProps) {
    const view = await setup(props)
    vi.spyOn(dialog(), 'getBoundingClientRect').mockReturnValue({
      height: HEIGHT,
    } as DOMRect)
    return view
  }

  interface Gesture {
    /** [distance down from the start, time in ms] for each move. */
    moves: [number, number][]
    /** Defaults to the last move's time. */
    upAt?: number
    end?: 'up' | 'cancel' | 'none'
    pointerType?: string
  }

  // performance.now is stubbed only around these synchronous events, never
  // across userEvent calls, which React's scheduler would also read it during.
  function drag(
    target: Element,
    { moves, upAt, end = 'up', pointerType = 'touch' }: Gesture,
  ) {
    const now = vi.spyOn(performance, 'now')
    const pointer = { pointerId: 1, pointerType }
    now.mockReturnValueOnce(0)
    fireEvent.pointerDown(target, { ...pointer, button: 0, clientY: START_Y })
    for (const [dy, time] of moves) {
      now.mockReturnValueOnce(time)
      fireEvent.pointerMove(target, {
        ...pointer,
        buttons: 1,
        clientY: START_Y + dy,
      })
    }
    const lastTime = moves.at(-1)?.[1] ?? 0
    if (end === 'up') {
      now.mockReturnValueOnce(upAt ?? lastTime)
      fireEvent.pointerUp(target, { ...pointer, clientY: START_Y })
    } else if (end === 'cancel') {
      fireEvent.pointerCancel(target, pointer)
    }
    now.mockRestore()
  }

  const slowLong: Gesture = {
    moves: [
      [100, 500],
      [200, 1000],
      [300, 1500],
    ],
  }

  async function expectClosed() {
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(opener()).toHaveFocus())
  }

  function expectSprungBack() {
    expect(dialog()).toHaveAttribute('data-state', 'open')
    expect(dialog().style.transform).toBe('')
    expect(dialog().style.transition).not.toBe('')
  }

  it('closes after a long, slow drag of the handle and returns focus', async () => {
    await setupSheet()

    drag(handle(), slowLong)

    await expectClosed()
  })

  it('closes after a long drag of the header', async () => {
    await setupSheet()

    drag(title(), slowLong)

    await expectClosed()
  })

  it('follows the pointer down, and not above the open position', async () => {
    await setupSheet()

    drag(handle(), { moves: [[50, 100]], end: 'none' })
    expect(dialog().style.transform).toBe('translateY(50px)')

    fireEvent.pointerMove(handle(), {
      pointerId: 1,
      buttons: 1,
      clientY: START_Y - 100,
    })
    expect(dialog().style.transform).toBe('translateY(0px)')
  })

  it('springs back after a short, slow drag', async () => {
    await setupSheet()

    drag(handle(), {
      moves: [
        [40, 500],
        [80, 1000],
      ],
      upAt: 1100,
    })

    expectSprungBack()
  })

  it('closes after a fast flick', async () => {
    await setupSheet()

    drag(handle(), { moves: [[40, 30]], upAt: 35 })

    await expectClosed()
  })

  it('springs back when a fast move is followed by a pause', async () => {
    await setupSheet()

    drag(handle(), { moves: [[40, 30]], upAt: 330 })

    expectSprungBack()
  })

  it('springs back and stops when a mouse release went missing', async () => {
    await setupSheet()
    drag(handle(), { moves: [[300, 100]], end: 'none', pointerType: 'mouse' })
    expect(dialog().style.transform).toBe('translateY(300px)')

    fireEvent.pointerMove(handle(), {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 0,
      clientY: START_Y + 400,
    })

    expectSprungBack()
    fireEvent.pointerMove(handle(), {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientY: START_Y + 400,
    })
    fireEvent.pointerUp(handle(), { pointerId: 1, pointerType: 'mouse' })
    expectSprungBack()
  })

  it('does not flick closed back at the open position', async () => {
    await setupSheet()

    drag(handle(), {
      moves: [
        [80, 500],
        [-20, 1000],
        [-14, 1008],
      ],
    })

    expectSprungBack()
  })

  it('keeps the first drag when a second finger touches the header', async () => {
    await setupSheet()
    drag(handle(), { ...slowLong, end: 'none' })

    fireEvent.pointerDown(title(), { pointerId: 2, button: 0, clientY: 50 })
    fireEvent.pointerUp(title(), { pointerId: 2, clientY: 50 })
    expect(dialog().style.transform).toBe('translateY(300px)')
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: START_Y + 300 })

    await expectClosed()
  })

  it('picks the sheet up where a spring-back has got to', async () => {
    await setupSheet()
    drag(handle(), { moves: [[80, 500]], upAt: 600 })
    expect(dialog().style.transition).not.toBe('')
    // Partway back: jsdom has no transitions.
    const sheet = dialog()
    const getComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) =>
      element === sheet
        ? ({ transform: 'matrix(1, 0, 0, 1, 0, 50)' } as CSSStyleDeclaration)
        : getComputedStyle(element),
    )

    drag(handle(), { moves: [[10, 100]], end: 'none' })

    expect(dialog().style.transform).toBe('translateY(60px)')
    expect(dialog().style.transition).toBe('')
  })

  it('springs back on pointercancel', async () => {
    await setupSheet()

    drag(handle(), { ...slowLong, end: 'cancel' })

    expectSprungBack()
  })

  it('does not drag from the body', async () => {
    await setupSheet({ children: <p>Body</p> })

    drag(screen.getByText('Body'), slowLong)

    expect(dialog()).toHaveAttribute('data-state', 'open')
    expect(dialog().style.transform).toBe('')
  })

  it('keeps the header buttons clickable, and does not drag from them', async () => {
    const onBack = vi.fn()
    const onEdit = vi.fn()
    const { user } = await setupSheet({
      headerStart: (
        <button type="button" onClick={onBack}>
          Back
        </button>
      ),
      headerEnd: (
        <button type="button" onClick={onEdit}>
          Edit
        </button>
      ),
    })

    for (const name of ['Back', 'Edit', 'Close']) {
      drag(screen.getByRole('button', { name }), slowLong)
      expect(dialog().style.transform).toBe('')
      expect(dialog()).toHaveAttribute('data-state', 'open')
    }

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onBack).toHaveBeenCalledOnce()
    expect(onEdit).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await expectClosed()
  })

  it('does nothing on the desktop layout', async () => {
    stubMediaQueries([])
    await setupSheet()

    drag(title(), slowLong)
    drag(handle(), { moves: [[40, 30]], upAt: 35 })

    expect(dialog()).toHaveAttribute('data-state', 'open')
    expect(dialog().style.transform).toBe('')
  })

  describe('with reduced motion', () => {
    beforeEach(() => {
      stubMediaQueries([SHEET_QUERY, REDUCED_MOTION_QUERY])
    })

    it('does not move the sheet, and closes past the distance', async () => {
      await setupSheet()

      drag(handle(), { ...slowLong, end: 'none' })
      expect(dialog().style.transform).toBe('')
      fireEvent.pointerUp(handle(), { pointerId: 1 })

      await expectClosed()
    })

    it('stays open after a short drag', async () => {
      await setupSheet()

      drag(handle(), {
        moves: [
          [40, 500],
          [80, 1000],
        ],
      })

      expect(dialog()).toHaveAttribute('data-state', 'open')
      expect(dialog().style.transform).toBe('')
    })
  })

  it('starts the exit animation from where the drag let go', async () => {
    stubExitAnimation()
    await setupSheet()

    drag(handle(), slowLong)

    const closing = dialog()
    expect(closing).toHaveAttribute('data-state', 'closed')
    expect(closing.style.transform).toBe('translateY(300px)')
    finishExitAnimation(closing)
    await expectClosed()
  })
})
