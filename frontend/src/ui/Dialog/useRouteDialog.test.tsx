import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  ScrollRestoration,
} from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import {
  finishExitAnimation,
  settle,
  stubExitAnimation,
} from '../../test/dialogAnimation'
import { stubMediaQueries } from '../../test/matchMedia'
import { Dialog } from './Dialog'
import styles from './Dialog.module.css'
import { fromParentState, useRouteDialog } from './useRouteDialog'
import { SHEET_QUERY } from './useSheetDrag'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function DialogRoute() {
  const dialog = useRouteDialog()

  return (
    <Dialog {...dialog} title="Details">
      <p>Body</p>
    </Dialog>
  )
}

type Entries = Parameters<typeof createMemoryRouter>[1]

function renderDialogRoute(options: Entries) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            <ScrollRestoration />
            <h1>List</h1>
            <Outlet />
          </>
        ),
        children: [{ path: 'reviews/:id', element: <DialogRoute /> }],
      },
      { path: '*', element: <h1>Not found</h1> },
    ],
    options,
  )
  render(<RouterProvider router={router} />)
  return router
}

const markedEntry = {
  pathname: '/reviews/5',
  search: '?category=movie',
  state: fromParentState,
}

const close = () =>
  userEvent.click(screen.getByRole('button', { name: 'Close' }))

it('goes back when opened from the parent', async () => {
  const router = renderDialogRoute({
    initialEntries: ['/?category=movie', markedEntry],
    initialIndex: 1,
  })

  await close()

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('?category=movie')
  expect(router.state.historyAction).toBe('POP')
})

it('goes back when dragged closed on a phone', async () => {
  stubMediaQueries([SHEET_QUERY])
  const router = renderDialogRoute({
    initialEntries: ['/?category=movie', markedEntry],
    initialIndex: 1,
  })
  const dialog = await screen.findByRole('dialog')
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
    height: 600,
  } as DOMRect)
  const handle = dialog.getElementsByClassName(styles.handle!)[0]!

  fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 100 })
  fireEvent.pointerMove(handle, { pointerId: 1, buttons: 1, clientY: 400 })
  fireEvent.pointerUp(handle, { pointerId: 1, clientY: 400 })

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('?category=movie')
  expect(router.state.historyAction).toBe('POP')
})

it('navigates to the parent and keeps the query on a direct link', async () => {
  const router = renderDialogRoute({
    initialEntries: ['/reviews/5?category=movie&q=x'],
  })
  const scrollTo = vi.spyOn(window, 'scrollTo')

  await close()

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('?category=movie&q=x')
  expect(router.state.historyAction).toBe('REPLACE')
  expect(scrollTo).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: 'List' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('navigates to the parent for an unmarked entry with history', async () => {
  const router = renderDialogRoute({
    initialEntries: ['/nope', '/reviews/5'],
    initialIndex: 1,
  })

  await close()

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.historyAction).toBe('REPLACE')
})

it('stays on the route until the exit animation ends', async () => {
  stubExitAnimation()
  const router = renderDialogRoute({
    initialEntries: ['/reviews/5?category=movie'],
  })

  await close()
  const closing = screen.getByRole('dialog')
  await settle()
  expect(router.state.location.pathname).toBe('/reviews/5')

  finishExitAnimation(closing)

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('?category=movie')
})

it('does not navigate again when Back happens during the exit', async () => {
  stubExitAnimation()
  const router = renderDialogRoute({
    initialEntries: ['/nope', '/?category=movie', markedEntry],
    initialIndex: 2,
  })

  await close()
  await router.navigate(-1)
  await settle()

  expect(router.state.location.pathname).toBe('/')
  expect(router.state.location.search).toBe('?category=movie')
})
