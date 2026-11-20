import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { WatchlistEmpty } from './WatchlistEmpty'

const addLink = {
  to: { pathname: '/watchlist/add', search: '?category=game' },
  state: { fromParent: true as const },
}

/** In a router only for the Link. */
function renderEmpty() {
  return render(
    <MemoryRouter>
      <WatchlistEmpty addLink={addLink} />
    </MemoryRouter>,
  )
}

it('says the watchlist is empty', () => {
  renderEmpty()

  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'Nothing on your watchlist yet',
    }),
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      'Save the things you mean to watch, play or read. They’ll wait here until you get to them.',
    ),
  ).toBeInTheDocument()
})

it('hides the art', () => {
  const { container } = renderEmpty()

  expect(
    container.querySelector('svg')?.closest('[aria-hidden="true"]'),
  ).not.toBeNull()
})

it('links to the add sheet', () => {
  renderEmpty()

  expect(
    screen.getByRole('link', { name: 'Add your first title' }),
  ).toHaveAttribute('href', '/watchlist/add?category=game')
})

it('has no axe violations', async () => {
  const { container } = renderEmpty()

  await expectNoAxeViolations(container)
})
