import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { WatchlistDetailStatus } from './WatchlistDetailStatus'

it('says it’s loading', () => {
  render(<WatchlistDetailStatus kind="loading" />)

  expect(screen.getByRole('status')).toHaveTextContent('Loading the title')
})

it('says a title is not found, with a way back', async () => {
  const onAction = vi.fn()
  render(<WatchlistDetailStatus kind="not-found" onAction={onAction} />)

  expect(
    screen.getByRole('heading', { name: 'Title not found' }),
  ).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Back to the watchlist' }),
  )
  expect(onAction).toHaveBeenCalledOnce()
})

it('says the title couldn’t load, with Try again', async () => {
  const onAction = vi.fn()
  render(<WatchlistDetailStatus kind="error" onAction={onAction} />)

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Couldn’t load this title.',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(onAction).toHaveBeenCalledOnce()
})

it.each(['loading', 'not-found', 'error'] as const)(
  'has no axe violations when %s',
  async (kind) => {
    const { container } = render(
      kind === 'loading' ? (
        <WatchlistDetailStatus kind={kind} />
      ) : (
        <WatchlistDetailStatus kind={kind} onAction={() => {}} />
      ),
    )

    await expectNoAxeViolations(container)
  },
)
