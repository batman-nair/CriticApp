import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authKeys } from '../../api/queries/auth'
import { reviewKeys } from '../../api/queries/reviews'
import { searchKeys } from '../../api/queries/search'
import { tagKeys } from '../../api/queries/tags'
import type { SearchResult } from '../../api/types'
import {
  makeItem,
  makeProblem,
  makeReview,
  makeReviewFacets,
  makeSearchResult,
} from '../../test/fixtures'
import { CREATED_REVIEW_ID, http, sessionAs } from '../../test/handlers'
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
const tagsField = () => screen.getByRole('textbox', { name: /^Tags/ })
const notes = () => screen.getByRole('textbox', { name: 'In a line or two' })
const button = (name: string) => screen.getByRole('button', { name })

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

describe('saving', () => {
  interface Sent {
    method: string
    path: string
    body: unknown
  }

  afterEach(() => server.events.removeAllListeners())

  /** Records each write's method, path and body; await the result to read them. */
  function recordWrites() {
    const sent: Promise<Sent>[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'GET') return
      sent.push(
        request
          .clone()
          .json()
          .then((body) => ({
            method: request.method,
            path: new URL(request.url).pathname,
            body,
          })),
      )
    })
    return () => Promise.all(sent)
  }

  /** Answers PATCH with the body merged into a review with that id. */
  function servePatch() {
    server.use(
      http.patch('/api/v3/reviews/{id}', async ({ params, request }) => {
        const update = await request.json()
        return Response.json({
          data: makeReview({
            id: Number(params.id),
            item: makeItem({ id: witcher.id }),
            ...update,
          }),
          meta: {},
        })
      }),
    )
  }

  /** Answers POST with `respond` instead of creating the review. */
  function failPost(respond: () => Response) {
    server.use(http.post('/api/v3/reviews', () => respond()))
  }

  /** Opens the sheet on Games and picks `result` from a search for "witcher". */
  async function pick(result: SearchResult = witcher, path?: string) {
    const user = userEvent.setup()
    localStorage.setItem('critic-add-category', 'game')
    serveSearch({ 'game/witcher': [result] })
    const view = await openSheet(path)
    await user.type(searchbox('Search games'), 'witcher')
    await user.click(await screen.findByRole('button', { name: /Wild Hunt/ }))
    return { ...view, user }
  }

  /** Rated 5.1 with the "comfort" tag, on Write with `text` typed. */
  async function fillIn(
    user: ReturnType<typeof userEvent.setup>,
    text = 'Huge.',
  ) {
    await user.keyboard('{ArrowRight}')
    await user.click(await screen.findByRole('button', { name: '+ comfort' }))
    await user.click(button('Next'))
    if (text) await user.type(notes(), text)
  }

  it('adds a new review end to end', async () => {
    const sent = recordWrites()
    const { dialog, user } = await pick()

    expect(slider()).toHaveAttribute('aria-valuenow', '5')
    await user.keyboard('{ArrowRight}')
    await user.click(await screen.findByRole('button', { name: '+ comfort' }))
    expect(tagsField()).toHaveValue('comfort')
    await user.click(button('Next'))

    expect(screen.getByRole('dialog', { name: 'Say a few words' })).toBe(dialog)
    expect(currentStep()).toHaveTextContent('Write')
    expect(dialog).toHaveTextContent('Your rating 5.1')
    await user.type(notes(), 'Huge.')
    await user.click(button('Add review'))

    expect(
      await screen.findByRole('dialog', { name: 'Added to your reviews' }),
    ).toBe(dialog)
    expect(await sent()).toEqual([
      {
        method: 'POST',
        path: '/api/v3/reviews',
        body: {
          item_id: witcher.id,
          rating: 5.1,
          text: 'Huge.',
          tags: ['comfort'],
        },
      },
    ])
    const card = within(dialog).getByRole('article')
    expect(within(card).getByRole('link')).toHaveAttribute(
      'href',
      `/reviews/${CREATED_REVIEW_ID}`,
    )
    expect(card).toHaveTextContent('5.1')
    expect(card).toHaveTextContent('Huge.')
    expect(button('Add another')).toBeVisible()
    expect(button('Done')).toBeVisible()
  })

  it('keeps the rating, tags and text through Back and Change', async () => {
    const { user } = await pick()
    await fillIn(user)

    await user.click(button('Back'))
    expect(screen.getByRole('dialog', { name: 'Rate it' })).toBeInTheDocument()
    expect(slider()).toHaveAttribute('aria-valuenow', '5.1')
    expect(tagsField()).toHaveValue('comfort')

    await user.click(button('Change'))
    expect(searchbox('Search games')).toHaveValue('witcher')
    await user.click(screen.getByRole('button', { name: /Wild Hunt/ }))
    expect(slider()).toHaveAttribute('aria-valuenow', '5.1')
    expect(tagsField()).toHaveValue('comfort')

    await user.click(button('Next'))
    expect(notes()).toHaveValue('Huge.')
  })

  it('starts again on an empty Find in the same category from Add another', async () => {
    const { user } = await pick()
    await fillIn(user)
    await user.click(button('Add review'))
    await screen.findByRole('dialog', { name: 'Added to your reviews' })

    await user.click(button('Add another'))

    expect(
      screen.getByRole('dialog', { name: 'What are you adding?' }),
    ).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent('Find')
    expect(searchbox('Search games')).toHaveValue('')
    expect(chip('Games')).toHaveAttribute('aria-pressed', 'true')
  })

  it('closes to the list, with its query string, from Done', async () => {
    const { router, user } = await pick(witcher, '/add?category=movie')
    await fillIn(user)
    await user.click(button('Add review'))
    await screen.findByRole('dialog', { name: 'Added to your reviews' })

    await user.click(button('Done'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(router.state.location.search).toBe('?category=movie')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('switches to an update on a 409, and updates on confirm', async () => {
    const sent = recordWrites()
    failPost(() => problem(409, 'DUPLICATE_REVIEW', { existing_review_id: 7 }))
    servePatch()
    const { dialog, user } = await pick()
    await fillIn(user)

    await user.click(button('Add review'))

    expect(
      await screen.findByRole('button', { name: 'Update review' }),
    ).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Update your words' })).toBe(
      dialog,
    )
    expect(notes()).toHaveValue('Huge.')
    await user.click(button('Back'))
    expect(dialog).toHaveTextContent(
      'Already in your reviews — your changes will update it.',
    )
    expect(slider()).toHaveAttribute('aria-valuenow', '5.1')
    expect(tagsField()).toHaveValue('comfort')
    await user.click(button('Next'))

    await user.click(button('Update review'))

    expect(await screen.findByRole('dialog', { name: 'Review updated' })).toBe(
      dialog,
    )
    expect((await sent()).slice(1)).toEqual([
      {
        method: 'PATCH',
        path: '/api/v3/reviews/7',
        body: { rating: 5.1, text: 'Huge.', tags: ['comfort'] },
      },
    ])
  })

  it('after a 409 with no text or tags, updates only the rating', async () => {
    const sent = recordWrites()
    failPost(() => problem(409, 'DUPLICATE_REVIEW', { existing_review_id: 7 }))
    servePatch()
    const { user } = await pick()
    await user.click(button('Next'))
    await user.click(button('Add review'))

    await user.click(
      await screen.findByRole('button', { name: 'Update review' }),
    )

    await screen.findByRole('dialog', { name: 'Review updated' })
    expect((await sent()).map(({ method, body }) => [method, body])).toEqual([
      ['POST', { item_id: witcher.id, rating: 5, text: '', tags: [] }],
      ['PATCH', { rating: 5 }],
    ])
  })

  describe('an item already reviewed', () => {
    const reviewed = makeSearchResult({ my_review: { id: 1, rating: 9.5 } })

    /** Serves review 1 with `review`'s fields, or a 404 when null. */
    function serveReview(review: Parameters<typeof makeReview>[0] | null) {
      server.use(
        // Overriding GET {id} catches /facets too.
        http.get('/api/v3/reviews/{id}', ({ params }) => {
          if (params.id === 'facets') return Response.json(makeReviewFacets())
          if (!review) return problem(404, 'NOT_FOUND')
          return Response.json({ data: makeReview(review), meta: {} })
        }),
      )
    }

    it('fills in the review, and updates it', async () => {
      const sent = recordWrites()
      serveReview({
        id: 1,
        item: makeItem({ id: reviewed.id }),
        rating: 6.5,
        tags: ['cozy'],
        text: 'Long.',
      })
      servePatch()
      const { dialog, user } = await pick(reviewed)

      expect(screen.getByRole('dialog', { name: 'Update your rating' })).toBe(
        dialog,
      )
      expect(dialog).toHaveTextContent(
        'Already in your reviews — your changes will update it.',
      )
      await waitFor(() =>
        expect(slider()).toHaveAttribute('aria-valuenow', '6.5'),
      )
      expect(tagsField()).toHaveValue('cozy')
      await user.click(button('Next'))
      expect(screen.getByRole('dialog', { name: 'Update your words' })).toBe(
        dialog,
      )
      expect(notes()).toHaveValue('Long.')
      await user.clear(notes())
      await user.click(button('Update review'))

      expect(
        await screen.findByRole('dialog', { name: 'Review updated' }),
      ).toBe(dialog)
      expect(await sent()).toEqual([
        {
          method: 'PATCH',
          path: '/api/v3/reviews/1',
          body: { rating: 6.5, text: '', tags: ['cozy'] },
        },
      ])
    })

    it('adds it as new when the review was deleted since', async () => {
      const sent = recordWrites()
      serveReview(null)
      const { dialog, user } = await pick(reviewed)

      expect(await screen.findByRole('dialog', { name: 'Rate it' })).toBe(
        dialog,
      )
      expect(dialog).not.toHaveTextContent('Already in your reviews')
      await user.click(button('Next'))
      await user.click(button('Add review'))

      await screen.findByRole('dialog', { name: 'Added to your reviews' })
      expect((await sent()).map(({ method, path }) => [method, path])).toEqual([
        ['POST', '/api/v3/reviews'],
      ])
    })
  })

  it('puts a tags.0 error under Tags on Rate, and keeps a text error on Write', async () => {
    let field = 'tags.0'
    failPost(() =>
      problem(400, 'VALIDATION_ERROR', {
        errors: [{ field, code: 'invalid', message: 'Not that.' }],
      }),
    )
    const { user } = await pick()
    await fillIn(user)

    await user.click(button('Add review'))

    await waitFor(() =>
      expect(tagsField()).toHaveAccessibleDescription('Not that.'),
    )
    expect(screen.getByRole('dialog', { name: 'Rate it' })).toBeInTheDocument()

    field = 'text'
    await user.click(button('Next'))
    await user.click(button('Add review'))

    await waitFor(() =>
      expect(notes()).toHaveAccessibleDescription(
        expect.stringContaining('Not that.'),
      ),
    )
    expect(
      screen.getByRole('dialog', { name: 'Say a few words' }),
    ).toBeInTheDocument()
  })

  it('shows a 502 on Write with Try again, which sends again', async () => {
    let fail = true
    let posts = 0
    server.use(
      http.post('/api/v3/reviews', async ({ request }) => {
        posts += 1
        const { item_id } = await request.json()
        if (fail) return problem(502, 'UPSTREAM_ERROR')
        return Response.json(
          {
            data: makeReview({ id: 4, item: makeItem({ id: item_id }) }),
            meta: {},
          },
          { status: 201 },
        )
      }),
    )
    const { user } = await pick()
    await fillIn(user)

    await user.click(button('Add review'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed.')
    fail = false
    await user.click(button('Try again'))
    await screen.findByRole('dialog', { name: 'Added to your reviews' })
    expect(posts).toBe(2)
  })

  it('doesn’t carry a 502 message over to the next review', async () => {
    let fail = true
    server.use(
      http.post('/api/v3/reviews', () => {
        if (fail) return problem(502, 'UPSTREAM_ERROR')
        return Response.json(
          {
            data: makeReview({ id: 4, item: makeItem({ id: witcher.id }) }),
            meta: {},
          },
          { status: 201 },
        )
      }),
    )
    const { user } = await pick()
    await fillIn(user)
    await user.click(button('Add review'))
    await screen.findByRole('alert')
    fail = false
    await user.click(button('Try again'))
    await screen.findByRole('dialog', { name: 'Added to your reviews' })

    await user.click(button('Add another'))
    await user.type(searchbox('Search games'), 'witcher')
    await user.click(await screen.findByRole('button', { name: /Wild Hunt/ }))
    await user.click(button('Next'))

    expect(notes()).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refreshes the list, counts, tags and search after a save', async () => {
    const { queryClient, user } = await pick()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await fillIn(user)

    await user.click(button('Add review'))
    await screen.findByRole('dialog', { name: 'Added to your reviews' })

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    // reviewKeys.all covers the lists and the facets.
    expect(keys).toEqual(
      expect.arrayContaining([reviewKeys.all, tagKeys.all, searchKeys.all]),
    )
  })
})
