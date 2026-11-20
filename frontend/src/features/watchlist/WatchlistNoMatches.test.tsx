import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { WatchlistNoMatches } from './WatchlistNoMatches'

it('names the category that matches nothing', () => {
  render(
    <WatchlistNoMatches category="series" total={7} onShowAll={() => {}} />,
  )

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
  render(
    <WatchlistNoMatches
      category="anime:movie"
      total={2}
      onShowAll={() => {}}
    />,
  )

  expect(
    screen.getByRole('heading', { name: 'No anime movies on your watchlist' }),
  ).toBeInTheDocument()
})

it('says "title" for one other entry', () => {
  render(<WatchlistNoMatches category="game" total={1} onShowAll={() => {}} />)

  expect(screen.getByText('Your other title is under All.')).toBeInTheDocument()
})

it('leaves out the number when the total is unknown', () => {
  render(<WatchlistNoMatches category="game" onShowAll={() => {}} />)

  expect(
    screen.getByText('Your other titles are under All.'),
  ).toBeInTheDocument()
})

it('calls onShowAll from "Show all"', async () => {
  const user = userEvent.setup()
  const onShowAll = vi.fn()
  render(<WatchlistNoMatches category="book" total={3} onShowAll={onShowAll} />)

  await user.click(screen.getByRole('button', { name: 'Show all' }))

  expect(onShowAll).toHaveBeenCalledOnce()
})

it('has no axe violations', async () => {
  const { container } = render(
    <WatchlistNoMatches category="book" total={3} onShowAll={() => {}} />,
  )

  await expectNoAxeViolations(container)
})
