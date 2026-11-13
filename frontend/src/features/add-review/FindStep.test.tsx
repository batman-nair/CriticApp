import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay } from 'msw'
import { afterEach, expect, it, vi } from 'vitest'
import type { SearchResult } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeProblem, makeSearchResult } from '../../test/fixtures'
import { http } from '../../test/handlers'
import { renderWithClient } from '../../test/render'
import { server } from '../../test/server'
import { FindStep } from './FindStep'
import { useAddFlow } from './useAddFlow'

afterEach(() => {
  localStorage.clear()
})

function Harness({ onSelect }: { onSelect: (result: SearchResult) => void }) {
  const [flow, dispatch] = useAddFlow('game')
  return (
    <FindStep
      category={flow.category}
      query={flow.query}
      onCategoryChange={(category) =>
        dispatch({ type: 'categoryChanged', category })
      }
      onQueryChange={(query) => dispatch({ type: 'queryChanged', query })}
      onSelect={onSelect}
    />
  )
}

function renderStep(onSelect = vi.fn()) {
  return { ...renderWithClient(<Harness onSelect={onSelect} />), onSelect }
}

const searchbox = () => screen.getByRole('searchbox', { name: 'Search games' })

function serveSearch(respond: (q: string) => Promise<Response> | Response) {
  server.use(
    http.get('/api/v3/search', ({ request }) =>
      respond(new URL(request.url).searchParams.get('q') ?? ''),
    ),
  )
}

function json(data: SearchResult[]) {
  return Response.json({ data, meta: {} })
}

it('shows skeleton chips while /categories loads, then the chips', async () => {
  server.use(
    http.get('/api/v3/categories', async () => {
      await delay(50)
      return Response.json({ data: [], meta: {} })
    }),
  )
  renderStep()

  expect(screen.queryByRole('group')).not.toBeInTheDocument()
  expect(
    await screen.findByRole('group', { name: 'Category' }),
  ).toBeEmptyDOMElement()
})

it('offers to load the categories again, and still searches', async () => {
  const user = userEvent.setup()
  let fail = true
  server.use(
    http.get('/api/v3/categories', ({ response }) =>
      fail
        ? response(500).json(makeProblem({ status: 500, code: 'SERVER_ERROR' }))
        : response.untyped(Response.json({ data: [], meta: {} })),
    ),
  )
  serveSearch(() => json([makeSearchResult()]))
  renderStep()

  expect(
    await screen.findByText('Couldn’t load the categories.'),
  ).toBeInTheDocument()
  // Named from the static labels until /categories answers.
  await user.type(searchbox(), 'witcher')
  expect(
    await screen.findByRole('button', { name: /The Witcher 3/ }),
  ).toBeInTheDocument()

  fail = false
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(
    await screen.findByRole('group', { name: 'Category' }),
  ).toBeInTheDocument()
})

it('falls back to the Problem’s detail for a 400 without a `q` error', async () => {
  const user = userEvent.setup()
  serveSearch(() =>
    Response.json(
      makeProblem({
        title: 'Bad Request',
        status: 400,
        code: 'VALIDATION_ERROR',
        detail: 'That link is not a game.',
      }),
      { status: 400 },
    ),
  )
  renderStep()

  await user.type(searchbox(), 'https://example.com')

  expect(
    await screen.findByText('That link is not a game.'),
  ).toBeInTheDocument()
  expect(searchbox()).toHaveAccessibleDescription('That link is not a game.')
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
})

it('says the connection failed for anything unexpected, and tries again', async () => {
  const user = userEvent.setup()
  let fail = true
  serveSearch(() => (fail ? Response.error() : json([makeSearchResult()])))
  renderStep()

  await user.type(searchbox(), 'witcher')

  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Couldn’t search. Check your connection and try again.',
    ),
  )
  fail = false
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(
    await screen.findByRole('button', { name: /The Witcher 3/ }),
  ).toBeInTheDocument()
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
})

it('dims the old results while a longer query loads', async () => {
  const user = userEvent.setup()
  serveSearch(async (q) => {
    if (q !== 'witc') return json([makeSearchResult()])
    await delay(200)
    return json([makeSearchResult({ id: 'igdb:2', title: 'The Witcher 2' })])
  })
  renderStep()

  await user.type(searchbox(), 'wit')
  const list = await screen.findByRole('list')
  expect(list).not.toHaveAttribute('aria-busy')

  await user.type(searchbox(), 'c')

  await waitFor(() => expect(list).toHaveAttribute('aria-busy', 'true'))
  expect(screen.getByRole('button', { name: /Wild Hunt/ })).toBeInTheDocument()
  expect(
    await screen.findByRole('button', { name: /The Witcher 2/ }),
  ).toBeInTheDocument()
  expect(screen.getByRole('list')).not.toHaveAttribute('aria-busy')
})

it('hands the picked result on', async () => {
  const user = userEvent.setup()
  const witcher = makeSearchResult()
  serveSearch(() => json([witcher]))
  const { onSelect } = renderStep()

  await user.type(searchbox(), 'witcher')
  await user.click(await screen.findByRole('button', { name: /Wild Hunt/ }))

  expect(onSelect).toHaveBeenCalledWith(witcher)
})

it('has no axe violations with results', async () => {
  const user = userEvent.setup()
  serveSearch(() =>
    json([
      makeSearchResult(),
      makeSearchResult({ id: 'igdb:2', my_review: { id: 3, rating: 8 } }),
    ]),
  )
  const { container } = renderStep()

  await user.type(searchbox(), 'witcher')
  await screen.findAllByRole('button', { name: /Wild Hunt/ })

  await expectNoAxeViolations(container)
})
