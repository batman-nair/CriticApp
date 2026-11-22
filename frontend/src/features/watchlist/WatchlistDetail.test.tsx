import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { makeItem } from '../../test/fixtures'
import { WatchlistDetail } from './WatchlistDetail'

const ADDED = '2025-04-02T12:00:00Z'

it('shows the poster, category, years and title', () => {
  const { container } = render(
    <WatchlistDetail item={makeItem()} ratingLabel="MyAnimeList" />,
  )

  expect(screen.getByText('Anime series · 1998–1999')).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { level: 2, name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  // Decorative: the title names it.
  expect(container.querySelector('img')).toHaveAttribute(
    'src',
    'https://cdn.example.com/cowboy-bebop.jpg',
  )
})

it('shows the provider’s rating under its label, and the date it was added', () => {
  render(
    <WatchlistDetail
      item={makeItem()}
      addedAt={ADDED}
      ratingLabel="MyAnimeList"
    />,
  )

  expect(
    screen.getByText('MyAnimeList', { selector: 'dt' }),
  ).toBeInTheDocument()
  expect(screen.getByText('8.8')).toBeInTheDocument()
  expect(screen.getByText('Added', { selector: 'dt' })).toBeInTheDocument()
  expect(screen.getByText('2 Apr 2025')).toHaveAttribute('datetime', ADDED)
})

it('labels the rating "Rating" when the category doesn’t say', () => {
  render(<WatchlistDetail item={makeItem()} ratingLabel={null} />)

  expect(screen.getByText('Rating', { selector: 'dt' })).toBeInTheDocument()
})

it('leaves the rating out while the label loads, and without one', () => {
  const { rerender } = render(
    <WatchlistDetail item={makeItem()} ratingLabel={undefined} />,
  )
  expect(screen.queryByText('8.8')).not.toBeInTheDocument()

  rerender(
    <WatchlistDetail
      item={makeItem({ provider_rating: null })}
      ratingLabel="MyAnimeList"
    />,
  )
  expect(screen.queryByText('MyAnimeList')).not.toBeInTheDocument()
  // Nothing to show, so no empty list either.
  expect(screen.queryByText('Added')).not.toBeInTheDocument()
})

it('shows the genres, creators, type, languages and description under About', () => {
  render(<WatchlistDetail item={makeItem()} ratingLabel="MyAnimeList" />)

  const about = screen.getByRole('heading', {
    level: 3,
    name: 'About',
  }).parentElement!
  expect(
    within(about)
      .getAllByRole('term')
      .map((term) => term.textContent),
  ).toEqual(['Genres', 'By', 'Type', 'Languages'])
  expect(
    within(about)
      .getAllByRole('definition')
      .map((value) => value.textContent),
  ).toEqual([
    'Action, Award Winning, Sci-Fi, Drama',
    'Sunrise',
    'TV',
    'Japanese',
  ])
  expect(
    within(about).getByText(
      'A bounty hunter crew drifts through the solar system.',
    ),
  ).toBeInTheDocument()
})

it('leaves out About when there’s nothing to say', () => {
  const item = makeItem({
    genres: [],
    creators: [],
    languages: [],
    description: '  ',
    details: { media_type: null },
  })
  render(<WatchlistDetail item={item} ratingLabel="MyAnimeList" />)

  expect(
    screen.queryByRole('heading', { name: 'About' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('separator')).not.toBeInTheDocument()
})

it('shows the actions it’s given', () => {
  render(
    <WatchlistDetail
      item={makeItem()}
      ratingLabel="MyAnimeList"
      actions={<button type="button">Review it</button>}
    />,
  )

  expect(screen.getByRole('button', { name: 'Review it' })).toBeInTheDocument()
})

it('tints itself with the category', () => {
  render(<WatchlistDetail item={makeItem()} ratingLabel="MyAnimeList" />)

  expect(screen.getByRole('article').style.getPropertyValue('--cat-base')).toBe(
    'var(--cat-anime-series-base)',
  )
})

it('has no axe violations', async () => {
  const { container } = render(
    <WatchlistDetail
      item={makeItem()}
      addedAt={ADDED}
      ratingLabel="MyAnimeList"
    />,
  )

  await expectNoAxeViolations(container)
})
