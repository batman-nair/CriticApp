import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../test/axe'
import { stubSystemTheme } from '../test/matchMedia'
import { renderRoute } from '../test/renderRoute'

const crash = vi.hoisted(() => ({ detail: false, header: false }))

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

  it.each([
    ['/reviews/5', 'Review 5'],
    ['/add', 'Add review'],
  ])('shows %s over the list', (path, name) => {
    renderRoute(path)
    expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    expect(hero()).toBeInTheDocument()
  })

  it('shows /login without the header or footer', () => {
    renderRoute('/login')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Log in' }),
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
    ['/reviews/5', 'Review · Critic'],
    ['/add', 'Add review · Critic'],
    ['/login', 'Log in · Critic'],
    ['/does-not-exist', 'Page not found · Critic'],
  ])('at %s is %s', (path, title) => {
    renderRoute(path)
    expect(document.title).toBe(title)
  })

  it('follows navigation', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    await user.click(screen.getByRole('link', { name: 'Add review' }))
    expect(document.title).toBe('Add review · Critic')
    await user.click(screen.getByRole('link', { name: 'Back to the list' }))
    expect(document.title).toBe('Critic')
  })
})

describe('when rendering throws', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('keeps the header around the 500 page for a page crash', () => {
    crash.detail = true
    renderRoute('/reviews/5')
    expect(
      screen.getByRole('heading', { level: 1, name: SERVER_ERROR }),
    ).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(document.title).toBe('Something broke · Critic')
  })

  it('recovers through "Back to my reviews"', async () => {
    const user = userEvent.setup()
    crash.detail = true
    renderRoute('/reviews/5')
    await user.click(screen.getByRole('link', { name: 'Back to my reviews' }))
    expect(hero()).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: SERVER_ERROR }),
    ).not.toBeInTheDocument()
    expect(document.title).toBe('Critic')
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
      screen.getByRole('heading', { level: 2, name: 'Add review' }),
    ).toBeInTheDocument()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('resets on an ordinary navigation', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.spyOn(window, 'scrollTo')
    renderRoute('/add')
    scrollTo.mockClear()
    await user.click(screen.getByRole('link', { name: 'Critic' }))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })
})

describe('accessibility', () => {
  it.each(['/', '/does-not-exist'])(
    'has no axe violations at %s',
    async (path) => {
      const { container } = renderRoute(path)
      await expectNoAxeViolations(container)
    },
    30_000,
  )
})
