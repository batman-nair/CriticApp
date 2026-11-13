import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../test/axe'
import { sessionAs } from '../test/handlers'
import { stubSystemTheme } from '../test/matchMedia'
import { renderRoute } from '../test/renderRoute'
import { server } from '../test/server'

const crash = vi.hoisted(() => ({ list: false, detail: false, header: false }))

vi.mock('../features/review-list/ReviewListPage', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../features/review-list/ReviewListPage')
    >()
  return {
    ReviewListPage: () => {
      if (crash.list) throw new Error('List crashed')
      return <original.ReviewListPage />
    },
  }
})

vi.mock(
  '../features/review-detail/ReviewDetailPage',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../features/review-detail/ReviewDetailPage')
      >()
    return {
      ReviewDetailPage: () => {
        if (crash.detail) throw new Error('Detail crashed')
        return <original.ReviewDetailPage />
      },
    }
  },
)

vi.mock('../layout/Header', async (importOriginal) => {
  const original = await importOriginal<typeof import('../layout/Header')>()
  return {
    Header: () => {
      if (crash.header) throw new Error('Header crashed')
      return <original.Header />
    },
  }
})

const HERO = 'Everything I’ve watched, played and read.'
const NOT_FOUND = 'This page isn’t on the shelf'
const SERVER_ERROR = 'Something broke on our end'

function hero() {
  return screen.getByRole('heading', { level: 1, name: HERO })
}

beforeEach(() => {
  stubSystemTheme('light')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  crash.list = false
  crash.detail = false
  crash.header = false
  localStorage.clear()
  sessionStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('routes', () => {
  it('shows the hero, header and footer at /', () => {
    renderRoute('/')
    expect(hero()).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('lists the owner’s reviews at /', async () => {
    renderRoute('/')
    expect(
      await screen.findByRole('link', { name: 'Cowboy Bebop' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'The Matrix' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('shows /reviews/1 over the list', async () => {
    renderRoute('/reviews/1')
    expect(
      await screen.findByRole('dialog', { name: 'Cowboy Bebop' }),
    ).toBeInTheDocument()
    // Behind the dialog, so outside the accessibility tree.
    expect(
      screen.getByRole('heading', { level: 1, name: HERO, hidden: true }),
    ).toBeInTheDocument()
  })

  it('shows /add over the list', async () => {
    renderRoute('/add')
    // The guard waits for the session.
    expect(
      await screen.findByRole('dialog', { name: 'What are you adding?' }),
    ).toBeInTheDocument()
    // Behind the dialog, so outside the accessibility tree.
    expect(
      screen.getByRole('heading', { level: 1, name: HERO, hidden: true }),
    ).toBeInTheDocument()
  })

  it('shows /login without the header or footer', () => {
    server.use(sessionAs(null))
    renderRoute('/login')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Welcome back' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })

  it.each(['/does-not-exist', '/reviews/5/extra'])(
    'shows the 404 inside the shell at %s',
    (path) => {
      renderRoute(path)
      expect(
        within(screen.getByRole('main')).getByRole('heading', {
          level: 1,
          name: NOT_FOUND,
        }),
      ).toBeInTheDocument()
      expect(screen.getByRole('banner')).toBeInTheDocument()
      expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    },
  )
})

describe('document title', () => {
  it.each([
    ['/', 'Critic'],
    ['/reviews/1', 'Review · Critic'],
    ['/add', 'Add review · Critic'],
    ['/login', 'Log in · Critic'],
    ['/does-not-exist', 'Page not found · Critic'],
  ])('at %s is %s', (path, title) => {
    // Logged out, so /login doesn't redirect.
    if (path === '/login') server.use(sessionAs(null))
    renderRoute(path)
    expect(document.title).toBe(title)
  })

  it('follows navigation', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    await user.click(screen.getByRole('link', { name: 'Add review' }))
    expect(document.title).toBe('Add review · Critic')
    await screen.findByRole('dialog', { name: 'What are you adding?' })
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(document.title).toBe('Critic'))
  })
})

describe('when rendering throws', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('keeps the header around the 500 page for a page crash', () => {
    crash.list = true
    renderRoute('/')
    expect(
      screen.getByRole('heading', { level: 1, name: SERVER_ERROR }),
    ).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(document.title).toBe('Something broke · Critic')
  })

  it('recovers through "Back to my reviews"', async () => {
    const user = userEvent.setup()
    crash.list = true
    renderRoute('/')
    crash.list = false
    await user.click(screen.getByRole('link', { name: 'Back to my reviews' }))
    expect(hero()).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: SERVER_ERROR }),
    ).not.toBeInTheDocument()
    expect(document.title).toBe('Critic')
  })

  it('keeps the list behind a dialog for a crash in the dialog', async () => {
    const user = userEvent.setup()
    crash.detail = true
    const { router } = renderRoute('/reviews/1')
    expect(
      screen.getByRole('dialog', { name: 'Something broke' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: HERO, hidden: true }),
    ).toBeInTheDocument()
    expect(document.title).toBe('Something broke · Critic')

    await user.click(screen.getByRole('button', { name: 'Back to the list' }))

    await waitFor(() => expect(document.title).toBe('Critic'))
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(hero()).toBeInTheDocument()
  })

  it('shows the 500 page in a main landmark when the header crashes', () => {
    crash.header = true
    renderRoute('/')
    expect(
      within(screen.getByRole('main')).getByRole('heading', {
        level: 1,
        name: SERVER_ERROR,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(document.title).toBe('Something broke · Critic')
  })
})

describe('scroll position', () => {
  it('stays put when the header opens /add', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.spyOn(window, 'scrollTo')
    renderRoute('/')
    scrollTo.mockClear()
    await user.click(screen.getByRole('link', { name: 'Add review' }))
    expect(
      await screen.findByRole('dialog', { name: 'What are you adding?' }),
    ).toBeInTheDocument()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('stays put when /add closes back to the list', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.spyOn(window, 'scrollTo')
    const { router } = renderRoute('/add')
    await screen.findByRole('dialog', { name: 'What are you adding?' })
    scrollTo.mockClear()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('stays put when /reviews/1 closes back to the list', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.spyOn(window, 'scrollTo')
    const { router } = renderRoute('/reviews/1')
    await screen.findByRole('dialog', { name: 'Cowboy Bebop' })
    scrollTo.mockClear()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('resets on an ordinary navigation', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.spyOn(window, 'scrollTo')
    // Not /add: the modal sheet would block the header.
    renderRoute('/does-not-exist')
    scrollTo.mockClear()
    await user.click(screen.getByRole('link', { name: 'Critic' }))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })
})

describe('accessibility', () => {
  it.each(['/', '/does-not-exist', '/reviews/1', '/add', '/login'])(
    'has no axe violations at %s',
    async (path) => {
      if (path === '/login') server.use(sessionAs(null))
      const { container } = renderRoute(path)
      // The sheet is in a portal, outside the container.
      const checked =
        path === '/add'
          ? await screen.findByRole('dialog', { name: 'What are you adding?' })
          : container
      await expectNoAxeViolations(checked)
    },
    30_000,
  )
})
