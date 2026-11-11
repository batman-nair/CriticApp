import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReviewFacets } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeReviewFacets } from '../../test/fixtures'
import { FilterPanel, type FilterPanelProps } from './FilterPanel'
import { useReviewFilters, type ReviewFilters } from './useReviewFilters'

const facets = makeReviewFacets({
  total: 5,
  languages: [
    { name: 'English', count: 3 },
    { name: 'Japanese', count: 2 },
  ],
}).data

interface HarnessProps {
  facets?: ReviewFacets
  ghost?: FilterPanelProps['ghost']
}

/** The panel as the page uses it, plus the page's "Clear filters". */
function Harness({ facets, ghost = null }: HarnessProps) {
  const { filters, setFilters, clearFilters } = useReviewFilters()
  return (
    <>
      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        facets={facets}
        ghost={ghost}
      />
      <button type="button" onClick={clearFilters}>
        Clear filters
      </button>
    </>
  )
}

function renderPanel(path = '/', props: HarnessProps = { facets }) {
  const router = createMemoryRouter(
    [{ path: '/', element: <Harness {...props} /> }],
    { initialEntries: [path] },
  )
  // Each location the router moves to, so a test can count navigations.
  const locations = [router.state.location]
  router.subscribe((state) => {
    if (state.location !== locations.at(-1)) locations.push(state.location)
  })
  const result = render(<RouterProvider router={router} />)
  return {
    ...result,
    router,
    locations,
    params: () => new URLSearchParams(router.state.location.search),
  }
}

const searchbox = () =>
  screen.getByRole('searchbox', { name: 'Search reviews' })
const language = () => screen.getByRole('combobox', { name: 'Language' })
const sort = () => screen.getByRole('combobox', { name: 'Sort' })

async function optionNames() {
  const options = await screen.findAllByRole('option')
  return options.map((option) => option.textContent)
}

describe('search', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const setupUser = () =>
    userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

  it('writes the search 300 ms after typing stops, replacing the entry', async () => {
    const user = setupUser()
    const { router, locations, params } = renderPanel()

    await user.type(searchbox(), 'du')
    await wait(200)
    await user.type(searchbox(), 'ne')
    await wait(200)

    expect(params().get('q')).toBeNull()

    await wait(100)

    expect(params().get('q')).toBe('dune')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(locations).toHaveLength(2)

    await wait(1000)
    expect(locations).toHaveLength(2)
  })

  it('trims the search', async () => {
    const user = setupUser()
    const { params } = renderPanel()

    await user.type(searchbox(), ' dune ')
    await wait(300)

    expect(params().get('q')).toBe('dune')
    expect(searchbox()).toHaveValue(' dune ')
  })

  it('clears the search at once with the clear button', async () => {
    const user = setupUser()
    const { router, params } = renderPanel('/?q=dune&category=movie')
    expect(searchbox()).toHaveValue('dune')

    await user.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(params().get('q')).toBeNull()
    expect(params().get('category')).toBe('movie')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(searchbox()).toHaveValue('')
  })

  it('drops typing that "Clear filters" interrupts', async () => {
    const user = setupUser()
    const { params } = renderPanel()

    await user.type(searchbox(), 'd')
    await wait(300)
    expect(params().get('q')).toBe('d')

    await user.type(searchbox(), 'un')
    await wait(100)
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(searchbox()).toHaveValue('')
    await wait(1000)
    expect(params().get('q')).toBeNull()
    expect(searchbox()).toHaveValue('')
  })

  it('drops typing that a navigation to another search interrupts', async () => {
    const user = setupUser()
    const { router, params } = renderPanel()

    await user.type(searchbox(), 'dun')
    await act(() => router.navigate('/?q=arrival'))

    expect(searchbox()).toHaveValue('arrival')
    await wait(1000)
    expect(params().get('q')).toBe('arrival')
  })

  it('follows the URL when it changes to a different search', async () => {
    const { router } = renderPanel('/?q=dune')

    await act(() => router.navigate('/?q=arrival'))

    expect(searchbox()).toHaveValue('arrival')
  })

  it('shows a search again after Back', async () => {
    const user = setupUser()
    const { router, params } = renderPanel()

    await user.type(searchbox(), 'du')
    await wait(300)
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(searchbox()).toHaveValue('')

    await act(() => router.navigate(-1))

    expect(searchbox()).toHaveValue('du')
    await wait(1000)
    expect(params().get('q')).toBe('du')
  })

  it('keeps newer typing when its own earlier write lands', async () => {
    const user = setupUser()
    const setFilters = vi.fn()
    const filters: ReviewFilters = {
      q: '',
      category: '',
      language: '',
      sort: '-updated',
    }
    const panel = (q: string) => (
      <FilterPanel
        filters={{ ...filters, q }}
        setFilters={setFilters}
        facets={facets}
        ghost={null}
      />
    )
    const { rerender } = render(panel(''))

    await user.type(searchbox(), 'd')
    await wait(300)
    expect(setFilters).toHaveBeenLastCalledWith({ q: 'd' }, { replace: true })
    await user.type(searchbox(), 'u')

    // The write of "d" lands after "u" was typed.
    rerender(panel('d'))

    expect(searchbox()).toHaveValue('du')
    await wait(300)
    expect(setFilters).toHaveBeenLastCalledWith({ q: 'du' }, { replace: true })
  })
})

describe('categories', () => {
  it('shows the facet counts, with the total on "All"', () => {
    renderPanel()

    const group = screen.getByRole('group', { name: 'Categories' })
    const chips = Array.from(group.querySelectorAll('button'))
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'All 5',
      'Movies 1',
      'Series 0',
      'Games 0',
      'Anime series 1',
      'Anime movies 0',
      'Manga 0',
      'Books 0',
    ])
    expect(screen.getByRole('button', { name: 'All 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('pushes the category a chip picks', async () => {
    const user = userEvent.setup()
    const { router, params } = renderPanel('/?q=dune')

    await user.click(screen.getByRole('button', { name: 'Anime series 1' }))

    expect(router.state.historyAction).toBe('PUSH')
    expect(params().get('category')).toBe('anime:series')
    expect(params().get('q')).toBe('dune')
    expect(
      screen.getByRole('button', { name: 'Anime series 1' }),
    ).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'All 5' }))

    expect(params().get('category')).toBeNull()
  })

  it('does not navigate from the selected chip', async () => {
    const user = userEvent.setup()
    const { locations } = renderPanel('/?category=movie')

    await user.click(screen.getByRole('button', { name: 'Movies 1' }))

    expect(locations).toHaveLength(1)
  })
})

describe('language', () => {
  it('offers "Any language" and the facet languages', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(language()).toHaveTextContent(/^Any language$/)

    await user.click(language())

    expect(await optionNames()).toEqual(['Any language', 'English', 'Japanese'])
  })

  it('pushes the language picked', async () => {
    const user = userEvent.setup()
    const { router, params } = renderPanel()

    await user.click(language())
    await user.click(await screen.findByRole('option', { name: 'Japanese' }))

    expect(router.state.historyAction).toBe('PUSH')
    expect(params().get('language')).toBe('Japanese')
  })

  it('matches the URL language to a facet ignoring case', async () => {
    const user = userEvent.setup()
    renderPanel('/?language=english')
    expect(language()).toHaveTextContent(/^English$/)

    await user.click(language())

    expect(await optionNames()).toEqual(['Any language', 'English', 'Japanese'])
    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('still shows a language that has no facet', async () => {
    const user = userEvent.setup()
    renderPanel('/?language=Klingon')
    expect(language()).toHaveTextContent(/^Klingon$/)

    await user.click(language())

    expect(await optionNames()).toEqual([
      'Any language',
      'English',
      'Japanese',
      'Klingon',
    ])
  })
})

describe('sort', () => {
  it('offers the four sorts and writes the one picked', async () => {
    const user = userEvent.setup()
    const { router, params } = renderPanel()
    expect(sort()).toHaveTextContent(/^Recently updated$/)

    await user.click(sort())

    expect(await optionNames()).toEqual([
      'Recently updated',
      'A–Z',
      'Rating: high to low',
      'Rating: low to high',
    ])

    await user.click(screen.getByRole('option', { name: 'A–Z' }))

    expect(router.state.historyAction).toBe('PUSH')
    expect(params().get('sort')).toBe('title')
  })
})

describe('without facets', () => {
  it('shows the chips without counts, and they still filter', async () => {
    const user = userEvent.setup()
    const { params } = renderPanel('/', {})

    const group = screen.getByRole('group', { name: 'Categories' })
    expect(
      Array.from(group.querySelectorAll('button')).map(
        (chip) => chip.textContent,
      ),
    ).toEqual([
      'All',
      'Movies',
      'Series',
      'Games',
      'Anime series',
      'Anime movies',
      'Manga',
      'Books',
    ])

    await user.click(screen.getByRole('button', { name: 'Games' }))

    expect(params().get('category')).toBe('game')
  })

  it('offers only "Any language" and the current one', async () => {
    const user = userEvent.setup()
    renderPanel('/?language=English', {})

    await user.click(language())

    expect(await optionNames()).toEqual(['Any language', 'English'])
  })

  it('still searches and sorts', async () => {
    const user = userEvent.setup()
    const { params } = renderPanel('/', {})

    await user.type(searchbox(), 'dune')
    await waitFor(() => expect(params().get('q')).toBe('dune'))

    await user.click(sort())
    await user.click(
      await screen.findByRole('option', { name: 'Rating: high to low' }),
    )

    expect(params().get('sort')).toBe('-rating')
  })
})

describe('ghost', () => {
  it('shows a disabled search and the chip names while loading', () => {
    const { container } = renderPanel('/', { facets, ghost: 'loading' })

    expect(searchbox()).toBeDisabled()
    expect(searchbox()).toHaveAttribute('placeholder', 'Loading your reviews…')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    // Only the page's "Clear filters" is a button.
    expect(screen.getAllByRole('button')).toHaveLength(1)
    const panel = container.firstElementChild!
    expect(panel).toHaveTextContent(
      'AllMoviesSeriesGamesAnime seriesAnime moviesMangaBooks',
    )
    expect(panel.textContent).not.toMatch(/\d/)
  })

  it('says search is unavailable after a failed load', () => {
    renderPanel('/', { ghost: 'unavailable' })

    expect(searchbox()).toBeDisabled()
    expect(searchbox()).toHaveAttribute(
      'placeholder',
      'Search is unavailable right now',
    )
  })
})

it('has no axe violations', async () => {
  const { container } = renderPanel('/?q=dune&category=movie')

  await expectNoAxeViolations(container)
})

it('has no axe violations as a ghost', async () => {
  const { container } = renderPanel('/', { ghost: 'loading' })

  await expectNoAxeViolations(container)
})
