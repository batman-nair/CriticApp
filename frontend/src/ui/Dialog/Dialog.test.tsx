import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import {
  finishExitAnimation,
  settle,
  stubExitAnimation,
} from '../../test/dialogAnimation'
import { Dialog } from './Dialog'
import styles from './Dialog.module.css'

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
