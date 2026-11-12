import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { Item, Review } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeItem, makeReview } from '../../test/fixtures'
import { ReviewDetail } from './ReviewDetail'

function renderDetail(
  review: Review = makeReview(),
  ratingLabel: string | null | undefined = 'MyAnimeList',
) {
  return render(<ReviewDetail review={review} ratingLabel={ratingLabel} />)
}

function withItem(overrides: Partial<Item>) {
  return makeReview({ item: makeItem(overrides) })
}

/** A rating box: its label and its value. */
function ratingBox(label: string) {
  return screen.getByText(label, { selector: 'dt' }).parentElement
}

/** The labels in the ratings row. */
function ratingLabels() {
  const row = ratingBox('My rating')?.parentElement as HTMLElement
  return within(row)
    .getAllByRole('term')
    .map((term) => term.textContent)
}

/** The About list as "key: value" rows. */
function aboutRows() {
  const list = screen.getByRole('heading', { level: 3, name: 'About' })
    .nextElementSibling as HTMLElement
  return within(list)
    .getAllByRole('term')
    .map(
      (term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`,
    )
}

it('shows the review and the item', () => {
  renderDetail()

  expect(screen.getByText('Anime series · 1998–1999')).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { level: 2, name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  expect(ratingBox('My rating')).toHaveTextContent('My rating9.5/10')
  const provider = ratingBox('MyAnimeList')
  expect(provider).toHaveTextContent('MyAnimeList8.8')
  expect(provider?.querySelector('svg')).toBeInTheDocument()
  expect(
    screen.getByText('“Still the coolest thing ever animated.”'),
  ).toBeInTheDocument()
  expect(aboutRows()).toEqual([
    'Genres: Action, Award Winning, Sci-Fi, Drama',
    'By: Sunrise',
    'Type: TV',
  ])
  expect(
    screen.getByText('A bounty hunter crew drifts through the solar system.'),
  ).toBeInTheDocument()
})

it('shows the poster with an empty alt', () => {
  const { container } = renderDetail()

  expect(container.querySelector('img')).toHaveAttribute(
    'src',
    'https://cdn.example.com/cowboy-bebop.jpg',
  )
  expect(container.querySelector('img')).toHaveAttribute('alt', '')
})

it('falls back to the first letter without a poster', () => {
  const { container } = renderDetail(withItem({ image_url: null }))

  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByText('C')).toBeInTheDocument()
})

it('leaves out the provider box without a provider rating', () => {
  renderDetail(withItem({ provider_rating: null }))

  expect(ratingLabels()).toEqual(['My rating'])
})

it('leaves out the provider box while its label loads', () => {
  render(<ReviewDetail review={makeReview()} ratingLabel={undefined} />)

  expect(ratingLabels()).toEqual(['My rating'])
  expect(screen.queryByText('8.8')).not.toBeInTheDocument()
})

it('labels the provider box "Rating" when its name is unknown', () => {
  renderDetail(makeReview(), null)

  expect(ratingBox('Rating')).toHaveTextContent('Rating8.8')
})

it.each([
  ['null', null],
  ['blank', '  \n '],
])('shows "No notes yet" when the text is %s', (_label, text) => {
  renderDetail(makeReview({ text }))

  expect(screen.getByText('No notes yet')).toBeInTheDocument()
  expect(screen.queryByText(/“/)).not.toBeInTheDocument()
})

it('has no description paragraph or More without a description', () => {
  renderDetail(withItem({ description: '  ' }))

  expect(screen.queryByText(/bounty hunter crew/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(aboutRows()).toHaveLength(3)
})

it('offers More for a long description', () => {
  renderDetail(withItem({ description: 'Space. '.repeat(30) }))

  expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
})

it('leaves out About with no facts and no description', () => {
  renderDetail(
    withItem({
      genres: [],
      creators: [],
      details: { media_type: null },
      description: null,
    }),
  )

  expect(
    screen.queryByRole('heading', { name: 'About' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('separator')).not.toBeInTheDocument()
})

it('leaves out empty facts', () => {
  renderDetail(withItem({ genres: [], details: { media_type: 'unknown' } }))

  expect(aboutRows()).toEqual(['By: Sunrise'])
})

it('has no Type row for a game', () => {
  renderDetail(
    withItem({
      category: 'game',
      title: 'Final Fantasy VII',
      details: { platforms: ['PlayStation'] },
    }),
  )

  expect(screen.getByText('Games · 1998–1999')).toBeInTheDocument()
  expect(aboutRows().map((row) => row.split(':')[0])).toEqual(['Genres', 'By'])
})

it('joins the creators as given', () => {
  renderDetail(withItem({ creators: ['Square Enix Co.', 'Ltd.'] }))

  expect(aboutRows()).toContain('By: Square Enix Co., Ltd.')
})

it('tints an anime movie as one', () => {
  renderDetail(withItem({ details: { media_type: 'Movie' } }))

  const root = screen.getByRole('article')
  expect(root.style.getPropertyValue('--cat-base')).toBe(
    'var(--cat-anime-movie-base)',
  )
  expect(screen.getByText(/^Anime movies/)).toBeInTheDocument()
  expect(aboutRows()).toContain('Type: Movie')
})

it('shows the start year alone for an ongoing title', () => {
  renderDetail(withItem({ end_year: null }))

  expect(screen.getByText('Anime series · 1998')).toBeInTheDocument()
})

it('has no axe violations', async () => {
  const { container } = renderDetail(
    withItem({ description: 'Space. '.repeat(30) }),
  )

  await expectNoAxeViolations(container)
})
