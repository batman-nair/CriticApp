import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { WatchlistEmpty } from './WatchlistEmpty'

it('says the watchlist is empty', () => {
  render(<WatchlistEmpty />)

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

it('hides the art and has no button yet', () => {
  const { container } = render(<WatchlistEmpty />)

  expect(
    container.querySelector('svg')?.closest('[aria-hidden="true"]'),
  ).not.toBeNull()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('has no axe violations', async () => {
  const { container } = render(<WatchlistEmpty />)

  await expectNoAxeViolations(container)
})
