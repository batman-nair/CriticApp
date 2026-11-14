import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { expect, it } from 'vitest'
import type { Review } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeItem, makeReview } from '../../test/fixtures'
import { fromParentState } from '../../ui/Dialog/useRouteDialog'
import { SavedReview } from './SavedReview'

function ShowLocation() {
  const location = useLocation()
  return (
    <p data-testid="location">
      {location.pathname}
      {location.search} {JSON.stringify(location.state)}
    </p>
  )
}

function setup(
  overrides: Partial<Review> = {},
  ratingLabel: string | null = 'MyAnimeList',
) {
  const review = makeReview({ id: 3, ...overrides })
  const router = createMemoryRouter(
    [
      {
        path: '/add',
        element: <SavedReview review={review} ratingLabel={ratingLabel} />,
      },
      { path: '/reviews/:id', element: <ShowLocation /> },
    ],
    {
      initialEntries: [
        '/',
        { pathname: '/add', search: '?q=bebop', state: fromParentState },
      ],
      initialIndex: 1,
    },
  )
  const view = render(<RouterProvider router={router} />)
  return { ...view, router, user: userEvent.setup() }
}

it('shows the category, years, title, notes and ratings', () => {
  const { container } = setup()

  expect(container).toHaveTextContent('Anime series · 1998–1999')
  expect(
    screen.getByRole('heading', { name: 'Cowboy Bebop' }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Still the coolest thing ever animated.'),
  ).toBeInTheDocument()
  expect(container).toHaveTextContent('9.5 /10')
  expect(screen.getByText('MyAnimeList 8.8')).toBeInTheDocument()
})

it('says when there are no notes', () => {
  setup({ text: null })

  expect(screen.getByText('No notes yet')).toBeInTheDocument()
})

it('files an anime movie under anime movies', () => {
  const { container } = setup({
    item: makeItem({ details: { media_type: 'movie' } }),
  })

  expect(container).toHaveTextContent('Anime movies · 1998–1999')
})

it('leaves out the provider rating without a rating or its name', () => {
  const { container, unmount } = setup({}, null)
  expect(container).not.toHaveTextContent('8.8')
  unmount()

  const view = setup({ item: makeItem({ provider_rating: null }) })
  expect(view.container).not.toHaveTextContent('MyAnimeList')
})

it('links to the review, replacing the sheet with its query and state', async () => {
  const { user, router } = setup()

  const link = screen.getByRole('link', { name: 'Cowboy Bebop' })
  expect(link).toHaveAttribute('href', '/reviews/3?q=bebop')
  await user.click(link)

  expect(screen.getByTestId('location')).toHaveTextContent(
    '/reviews/3?q=bebop {"fromParent":true}',
  )
  expect(router.state.historyAction).toBe('REPLACE')
})

it('has no axe violations', async () => {
  const { container } = setup()
  await expectNoAxeViolations(container)
})
