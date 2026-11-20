import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { makeItem, makeWatchlistEntry } from '../../test/fixtures'
import { WatchlistCard } from './WatchlistCard'

it('is an article named by the title, with the poster', () => {
  render(<WatchlistCard entry={makeWatchlistEntry()} />)

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
  render(<WatchlistCard entry={makeWatchlistEntry({ item })} />)

  expect(screen.getByText(meta)).toBeInTheDocument()
})

it('leaves out the years without a start year', () => {
  const item = makeItem({ category: 'manga', start_year: null, end_year: null })
  render(<WatchlistCard entry={makeWatchlistEntry({ item })} />)

  expect(screen.getByText('Manga')).toBeInTheDocument()
  expect(screen.queryByText(/·/)).not.toBeInTheDocument()
})

it('shows the fallback letter, named for the title, without an image', () => {
  const item = makeItem({ image_url: null })
  render(<WatchlistCard entry={makeWatchlistEntry({ item })} />)

  expect(
    screen.getByRole('img', { name: 'Poster for Cowboy Bebop' }),
  ).toHaveTextContent('C')
})

it('has no actions yet', () => {
  render(<WatchlistCard entry={makeWatchlistEntry()} />)

  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it('has no axe violations', async () => {
  const { container } = render(<WatchlistCard entry={makeWatchlistEntry()} />)

  await expectNoAxeViolations(container)
})
