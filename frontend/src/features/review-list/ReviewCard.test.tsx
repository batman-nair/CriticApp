import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { expect, it } from 'vitest'
import type { Review } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeItem, makeReview } from '../../test/fixtures'
import { fromParentState } from '../../ui/Dialog/useRouteDialog'
import { ReviewCard } from './ReviewCard'
import styles from './ReviewCard.module.css'

function Detail() {
  const location = useLocation()
  return <h1>Detail {location.pathname}</h1>
}

function renderCard(review: Review, path = '/') {
  const router = createMemoryRouter(
    [
      { path: '/', element: <ReviewCard review={review} /> },
      { path: '/reviews/:id', element: <Detail /> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...render(<RouterProvider router={router} />) }
}

it('shows the category, years, title, text, rating and three genres', () => {
  renderCard(makeReview())

  expect(screen.getByText('Anime series · 1998–1999')).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { level: 2, name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Still the coolest thing ever animated.'),
  ).toHaveClass(styles.text!)
  expect(screen.getByText('9.5')).toBeInTheDocument()
  expect(screen.getByText('Action, Award Winning, Sci-Fi')).toBeInTheDocument()
  expect(screen.queryByText(/Drama/)).not.toBeInTheDocument()
})

it.each([
  ['null', null],
  ['whitespace', '  \n '],
])('shows "No notes yet" when the text is %s', (_label, text) => {
  renderCard(makeReview({ text }))

  expect(screen.getByText('No notes yet')).toBeInTheDocument()
})

it('leaves out the separator when there is no year', () => {
  renderCard(
    makeReview({ item: makeItem({ start_year: null, end_year: null }) }),
  )

  expect(screen.getByText('Anime series')).toBeInTheDocument()
  expect(screen.queryByText(/·/)).not.toBeInTheDocument()
})

it('leaves out the genres when there are none', () => {
  renderCard(makeReview({ item: makeItem({ genres: [] }) }))

  const badge = screen.getByText('9.5').parentElement
  expect(badge?.nextElementSibling).toBeNull()
})

it('colours an anime movie as one', () => {
  renderCard(
    makeReview({
      item: makeItem({ details: { media_type: 'Movie' }, end_year: null }),
    }),
  )

  const card = screen.getByRole('article')
  expect(card.style.getPropertyValue('--cat')).toBe('var(--cat-anime-movie)')
  expect(card.style.getPropertyValue('--cat-base')).toBe(
    'var(--cat-anime-movie-base)',
  )
  expect(screen.getByText('Anime movies · 1998')).toBeInTheDocument()
})

it('links by title to the review, keeping the search', () => {
  renderCard(makeReview({ id: 7 }), '/?q=x')

  expect(screen.getByRole('link', { name: 'Cowboy Bebop' })).toHaveAttribute(
    'href',
    '/reviews/7?q=x',
  )
})

it('opens the review with the dialog state for going back', async () => {
  const user = userEvent.setup()
  const { router } = renderCard(makeReview({ id: 7 }))

  await user.click(screen.getByRole('link', { name: 'Cowboy Bebop' }))

  expect(
    screen.getByRole('heading', { name: 'Detail /reviews/7' }),
  ).toBeInTheDocument()
  expect(router.state.location.state).toEqual(fromParentState)
})

it('has no axe violations', async () => {
  const { container } = renderCard(makeReview())

  await expectNoAxeViolations(container)
})
