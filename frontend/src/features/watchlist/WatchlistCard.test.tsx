import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { makeItem, makeWatchlistEntry } from '../../test/fixtures'
import { WatchlistCard } from './WatchlistCard'

const noop = () => {}

/** The card on the watchlist page at `path`, for its link. */
function renderCard(ui: ReactElement, path = '/watchlist') {
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    ),
  })
}

it('is an article named by the title, with the poster', () => {
  renderCard(<WatchlistCard onRemove={noop} entry={makeWatchlistEntry()} />)

  expect(
    screen.getByRole('article', { name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { level: 2, name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('img', { name: 'Poster for Cowboy Bebop' }),
  ).toHaveAttribute('src', 'https://cdn.example.com/cowboy-bebop.jpg')
})

it.each([
  [makeItem(), 'Anime series · 1998–1999'],
  [makeItem({ details: { media_type: 'Movie' } }), 'Anime movie · 1998–1999'],
  [
    makeItem({
      category: 'movie',
      start_year: 2024,
      end_year: null,
      details: { media_type: 'movie' },
    }),
    'Movie · 2024',
  ],
  [
    makeItem({ category: 'game', start_year: 2017, end_year: null }),
    'Game · 2017',
  ],
  [
    makeItem({ category: 'book', start_year: 2021, end_year: 2021 }),
    'Book · 2021',
  ],
])('labels the category in the singular, with the years', (item, meta) => {
  renderCard(
    <WatchlistCard onRemove={noop} entry={makeWatchlistEntry({ item })} />,
  )

  expect(screen.getByText(meta)).toBeInTheDocument()
})

it('leaves out the years without a start year', () => {
  const item = makeItem({ category: 'manga', start_year: null, end_year: null })
  renderCard(
    <WatchlistCard onRemove={noop} entry={makeWatchlistEntry({ item })} />,
  )

  expect(screen.getByText('Manga')).toBeInTheDocument()
  expect(screen.queryByText(/·/)).not.toBeInTheDocument()
})

it('shows the fallback letter, named for the title, without an image', () => {
  const item = makeItem({ image_url: null })
  renderCard(
    <WatchlistCard onRemove={noop} entry={makeWatchlistEntry({ item })} />,
  )

  expect(
    screen.getByRole('img', { name: 'Poster for Cowboy Bebop' }),
  ).toHaveTextContent('C')
})

it('links Review it to the sheet for the title, keeping the page’s query', () => {
  const item = makeItem({ id: 'mal:52991', title: 'Frieren' })
  renderCard(
    <WatchlistCard onRemove={noop} entry={makeWatchlistEntry({ item })} />,
    '/watchlist?category=anime%3Aseries',
  )

  const link = screen.getByRole('link', { name: 'Review Frieren' })
  expect(link).toHaveAttribute(
    'href',
    '/watchlist/review/mal%3A52991?category=anime%3Aseries',
  )
  expect(link).toHaveTextContent('Review it')
})

it('has a Remove button for the title, after Review it', async () => {
  const onRemove = vi.fn()
  const item = makeItem({ title: 'Frieren' })
  renderCard(
    <WatchlistCard entry={makeWatchlistEntry({ item })} onRemove={onRemove} />,
  )

  const remove = screen.getByRole('button', {
    name: 'Remove Frieren from your watchlist',
  })
  expect(
    screen
      .getByRole('link', { name: 'Review Frieren' })
      .compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  await userEvent.click(remove)
  expect(onRemove).toHaveBeenCalledOnce()
  expect(onRemove.mock.calls[0]?.[0]).toMatchObject({ type: 'click' })
})

it('is marked when just added, and not otherwise', () => {
  const { rerender } = renderCard(
    <WatchlistCard onRemove={noop} entry={makeWatchlistEntry()} />,
  )
  const card = screen.getByRole('article')
  expect(card).not.toHaveAttribute('data-fresh')

  rerender(<WatchlistCard onRemove={noop} entry={makeWatchlistEntry()} fresh />)
  expect(card).toHaveAttribute('data-fresh')
})

it('has no axe violations', async () => {
  const { container } = renderCard(
    <WatchlistCard onRemove={noop} entry={makeWatchlistEntry()} />,
  )

  await expectNoAxeViolations(container)
})
