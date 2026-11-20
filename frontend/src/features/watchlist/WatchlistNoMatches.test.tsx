import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { WatchlistNoMatches } from './WatchlistNoMatches'

const addLink = {
  to: { pathname: '/watchlist/add', search: '?category=book' },
  state: { fromParent: true as const, category: 'book' as const },
}

/** In a router only for the Link. */
function renderNoMatches(
  props: Omit<ComponentProps<typeof WatchlistNoMatches>, 'addLink'>,
) {
  return render(
    <MemoryRouter>
      <WatchlistNoMatches addLink={addLink} {...props} />
    </MemoryRouter>,
  )
}

it('names the category that matches nothing', () => {
  renderNoMatches({ category: 'series', total: 7, onShowAll: () => {} })

  expect(screen.getByText('Series')).toBeInTheDocument()
  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'No series on your watchlist',
    }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Your other 7 titles are under All.'),
  ).toBeInTheDocument()
})

it('lower-cases the chip label in the title', () => {
  renderNoMatches({ category: 'anime:movie', total: 2, onShowAll: () => {} })

  expect(
    screen.getByRole('heading', { name: 'No anime movies on your watchlist' }),
  ).toBeInTheDocument()
})

it('says "title" for one other entry', () => {
  renderNoMatches({ category: 'game', total: 1, onShowAll: () => {} })

  expect(screen.getByText('Your other title is under All.')).toBeInTheDocument()
})

it('leaves out the number when the total is unknown', () => {
  renderNoMatches({ category: 'game', onShowAll: () => {} })

  expect(
    screen.getByText('Your other titles are under All.'),
  ).toBeInTheDocument()
})

it.each([
  ['movie', 'Add a movie'],
  ['series', 'Add a series'],
  ['game', 'Add a game'],
  ['anime:series', 'Add an anime series'],
  ['anime:movie', 'Add an anime movie'],
  ['manga', 'Add a manga'],
  ['book', 'Add a book'],
])('offers to add to %s with "%s", first', (category, name) => {
  renderNoMatches({ category, total: 3, onShowAll: () => {} })

  const add = screen.getByRole('link', { name })
  expect(add).toHaveAttribute('href', '/watchlist/add?category=book')
  expect(add.nextElementSibling).toBe(
    screen.getByRole('button', { name: 'Show all' }),
  )
})

it('calls onShowAll from "Show all"', async () => {
  const user = userEvent.setup()
  const onShowAll = vi.fn()
  renderNoMatches({ category: 'book', total: 3, onShowAll })

  await user.click(screen.getByRole('button', { name: 'Show all' }))

  expect(onShowAll).toHaveBeenCalledOnce()
})

it('has no axe violations', async () => {
  const { container } = renderNoMatches({
    category: 'book',
    total: 3,
    onShowAll: () => {},
  })

  await expectNoAxeViolations(container)
})
