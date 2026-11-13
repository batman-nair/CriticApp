import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authKeys } from '../../api/queries/auth'
import type { SearchResult } from '../../api/types'
import { makeProblem, makeSearchResult } from '../../test/fixtures'
import { http, sessionAs } from '../../test/handlers'
import { stubSystemTheme } from '../../test/matchMedia'
import { renderRoute } from '../../test/renderRoute'
import { server } from '../../test/server'

// The header's theme toggle reads the system theme.
beforeEach(() => {
  stubSystemTheme('light')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

const witcher = makeSearchResult()

/**
 * Answers each search with `respond`, or the results for `category/q` in
 * `results`, and records each request's query.
 */
function serveSearch(
  results: Record<string, SearchResult[]> = {},
  respond?: () => Response,
) {
  const requests: Record<string, string>[] = []
  server.use(
    http.get('/api/v3/search', ({ request }) => {
      const params = new URL(request.url).searchParams
      requests.push(Object.fromEntries(params))
      if (respond) return respond()
      const key = `${params.get('category')}/${params.get('q')}`
      return Response.json({ data: results[key] ?? [], meta: {} })
    }),
  )
  return requests
}

function problem(status: number, code: string, extra = {}) {
  return Response.json(
    makeProblem({ title: 'Error', status, code, detail: 'Failed.', ...extra }),
    { status },
  )
}

async function openSheet(path = '/add') {
  const view = renderRoute(path)
  const dialog = await screen.findByRole('dialog', {
    name: 'What are you adding?',
  })
  return { ...view, dialog }
}

const searchbox = (name = 'Search movies') =>
  screen.getByRole('searchbox', { name })
const chip = (name: string) => screen.getByRole('button', { name })
const currentStep = () =>
  within(screen.getByRole('list', { name: 'Add review steps' })).getByText(
    (_, element) => element?.getAttribute('aria-current') === 'step',
  )
const status = () => screen.getByRole('status')
const slider = () => screen.getByRole('slider', { name: 'Your rating' })

it('opens on Find with the category chips and the footer', async () => {
  const { dialog } = await openSheet()

  expect(currentStep()).toHaveTextContent('Find')
  const chips = await within(dialog).findByRole('group', { name: 'Category' })
  expect(
    within(chips)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Movies', 'Series', 'Games', 'Anime', 'Manga', 'Books'])
  expect(chip('Movies')).toHaveAttribute('aria-pressed', 'true')
  expect(searchbox()).toHaveAttribute('placeholder', 'Search movies')
  expect(searchbox()).toHaveFocus()
  expect(within(dialog).getByText('Pick a result to continue')).toBeVisible()
  // Mounted before anything goes wrong, so a message is announced.
  expect(status()).toBeEmptyDOMElement()
})

describe('typing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const setupUser = () =>
    userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

  it('waits for 3 characters, then searches 300 ms after typing stops', async () => {
    const user = setupUser()
    const requests = serveSearch({ 'movie/dune': [] })
    await openSheet()

    await user.type(searchbox(), 'du')
    await wait(1000)
    expect(requests).toEqual([])
    expect(searchbox()).toHaveAccessibleDescription(
      'Type at least 3 characters.',
    )

    await user.type(searchbox(), 'n')
    await wait(200)
    await user.type(searchbox(), 'e ')
    await wait(250)
    expect(requests).toEqual([])

    await wait(50)
    await waitFor(() =>
      expect(requests).toEqual([{ category: 'movie', q: 'dune' }]),
    )
    await wait(1000)
    expect(requests).toHaveLength(1)
  })
})

it('searches the same text again in another category, and remembers it', async () => {
  const user = userEvent.setup()
  const requests = serveSearch({ 'game/witcher': [witcher] })
  await openSheet()

  await user.type(searchbox(), 'witcher')
  await waitFor(() => expect(requests).toHaveLength(1))
  await user.click(await screen.findByRole('button', { name: 'Games' }))

  expect(
    await screen.findByRole('button', { name: /Wild Hunt/ }),
  ).toBeInTheDocument()
  expect(requests).toEqual([
    { category: 'movie', q: 'witcher' },
    { category: 'game', q: 'witcher' },
  ])
  expect(chip('Games')).toHaveAttribute('aria-pressed', 'true')
  expect(searchbox('Search games')).toHaveValue('witcher')
  expect(localStorage.getItem('critic-add-category')).toBe('game')
})

it('opens on the category picked last time', async () => {
  localStorage.setItem('critic-add-category', 'manga')
  await openSheet()

  expect(await screen.findByRole('button', { name: 'Manga' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(searchbox('Search manga')).toBeInTheDocument()
})

it('mentions IMDb links for movies and series only', async () => {
  const user = userEvent.setup()
  await openSheet()
  const hint = 'You can also paste an IMDb link.'

  expect(searchbox()).toHaveAccessibleDescription(hint)
  await user.click(await screen.findByRole('button', { name: 'Series' }))
  expect(searchbox('Search series')).toHaveAccessibleDescription(hint)

  for (const name of ['Games', 'Anime', 'Manga', 'Books']) {
    await user.click(chip(name))
    expect(
      searchbox(`Search ${name.toLowerCase()}`),
    ).not.toHaveAccessibleDescription()
    expect(screen.queryByText(hint)).not.toBeInTheDocument()
  }
})

describe('when the search fails', () => {
  it('shows a 400 on `q` under the field', async () => {
    const user = userEvent.setup()
    const message = 'That is a series link. Search in Series instead.'
    serveSearch({}, () =>
      problem(400, 'VALIDATION_ERROR', {
        errors: [{ field: 'q', code: 'invalid', message }],
      }),
    )
    await openSheet()

    await user.type(searchbox(), 'https://www.imdb.com/title/tt0903747/')

    await waitFor(() =>
      expect(searchbox()).toHaveAccessibleDescription(message),
    )
    expect(status()).toBeEmptyDOMElement()
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument()
  })

  it('names the provider on a 502, and tries again', async () => {
    const user = userEvent.setup()
    let fail = true
    const requests = serveSearch({}, () =>
      fail
        ? problem(502, 'UPSTREAM_ERROR')
        : Response.json({ data: [witcher], meta: {} }),
    )
    await openSheet()

    await user.type(searchbox(), 'witcher')

    await waitFor(() =>
      expect(status()).toHaveTextContent('OMDb isn’t answering right now.'),
    )
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('button', { name: /Wild Hunt/ }),
    ).toBeInTheDocument()
    expect(requests).toHaveLength(2)
    expect(status()).toBeEmptyDOMElement()
  })

  it('asks for a moment on a 429', async () => {
    const user = userEvent.setup()
    serveSearch({}, () => problem(429, 'RATE_LIMITED'))
    await openSheet()

    await user.type(searchbox(), 'witcher')

    await waitFor(() =>
      expect(status()).toHaveTextContent(
        'Too many searches. Try again in a moment.',
      ),
    )
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  it('goes to the login page on a 401, coming back to /add', async () => {
    const user = userEvent.setup()
    serveSearch({}, () => problem(401, 'UNAUTHENTICATED'))
    const { router, queryClient } = await openSheet()
    // The refetch agrees: the session has run out.
    server.use(sessionAs(null))

    await user.type(searchbox(), 'witcher')

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2Fadd')
    expect(queryClient.getQueryData(authKeys.session())).toEqual({
      user: null,
    })
  })
})

it('says when nothing was found', async () => {
  const user = userEvent.setup()
  serveSearch()
  await openSheet()

  await user.type(searchbox(), 'zzzzz')

  await waitFor(() =>
    expect(status()).toHaveTextContent(
      'No movies found for “zzzzz”. Try another spelling or category.',
    ),
  )
})

it('moves to Rate with the picked result, and Back returns to the results', async () => {
  const user = userEvent.setup()
  localStorage.setItem('critic-add-category', 'game')
  serveSearch({ 'game/witcher': [witcher] })
  const { dialog } = await openSheet()

  await user.type(searchbox('Search games'), 'witcher')
  await user.click(await screen.findByRole('button', { name: /Wild Hunt/ }))

  expect(screen.getByRole('dialog', { name: 'Rate it' })).toBe(dialog)
  expect(currentStep()).toHaveTextContent('Rate')
  expect(dialog).toHaveTextContent('The Witcher 3: Wild Hunt')
  expect(slider()).toBeInTheDocument()
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Back' }))

  expect(screen.getByRole('dialog', { name: 'What are you adding?' })).toBe(
    dialog,
  )
  expect(currentStep()).toHaveTextContent('Find')
  expect(searchbox('Search games')).toHaveValue('witcher')
  expect(chip('Games')).toHaveAttribute('aria-pressed', 'true')
  // At once, from the cache.
  expect(screen.getByRole('button', { name: /Wild Hunt/ })).toBeInTheDocument()
})

it('closes back to the list', async () => {
  const user = userEvent.setup()
  const { router } = await openSheet('/add?category=movie')

  await user.click(screen.getByRole('button', { name: 'Close' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.search).toBe('?category=movie')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
