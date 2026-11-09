import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { expect, it, vi } from 'vitest'
import { Chip } from './Chip'

const dotIn = (button: HTMLElement) =>
  button.querySelector('[aria-hidden="true"]')

it('has aria-pressed on a filter chip that follows selected', () => {
  const { rerender } = render(<Chip>All</Chip>)
  const button = screen.getByRole('button', { name: 'All' })
  expect(button).toHaveAttribute('aria-pressed', 'false')

  rerender(<Chip selected>All</Chip>)
  expect(button).toHaveAttribute('aria-pressed', 'true')

  rerender(<Chip selected={false}>All</Chip>)
  expect(button).toHaveAttribute('aria-pressed', 'false')
})

it('shows a dot only with a category', () => {
  const { rerender } = render(<Chip>All</Chip>)
  expect(dotIn(screen.getByRole('button'))).not.toBeInTheDocument()

  rerender(<Chip category="movie">Movies</Chip>)
  expect(dotIn(screen.getByRole('button'))).toBeInTheDocument()
})

it('separates the label and count in the accessible name', () => {
  render(
    <Chip category="anime:series" count={4}>
      Anime series
    </Chip>,
  )

  const button = screen.getByRole('button')
  expect(button).toHaveAccessibleName('Anime series 4')
  expect(button).toHaveTextContent(/^Anime series 4$/)
})

it('shows a count of 0', () => {
  render(<Chip count={0}>Series</Chip>)

  expect(screen.getByRole('button')).toHaveAccessibleName('Series 0')
})

it('leaves the count out when it is not given', () => {
  render(<Chip>Series</Chip>)

  expect(screen.getByRole('button')).toHaveAccessibleName('Series')
})

it('renders a suggestion with a plus, no pressed state and no dot', () => {
  render(
    <Chip variant="suggestion" category="movie" selected aria-pressed="true">
      Drama
    </Chip>,
  )

  const button = screen.getByRole('button', { name: '+ Drama' })
  expect(button).not.toHaveAttribute('aria-pressed')
  expect(dotIn(button)).not.toBeInTheDocument()
})

it('defaults to type="button" and lets the caller override it', () => {
  const { rerender } = render(<Chip>All</Chip>)
  expect(screen.getByRole('button')).toHaveAttribute('type', 'button')

  rerender(<Chip type="submit">All</Chip>)
  expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
})

it('merges the category variables with a caller style', () => {
  render(
    <Chip category="movie" style={{ marginTop: 4 }}>
      Movies
    </Chip>,
  )

  const button = screen.getByRole('button')
  expect(button.style.getPropertyValue('--cat')).not.toBe('')
  expect(button.style.marginTop).toBe('4px')
})

it('passes native props, ref and className through', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  const ref = createRef<HTMLButtonElement>()
  render(
    <Chip ref={ref} onClick={onClick} className="mine">
      All
    </Chip>,
  )

  const button = screen.getByRole('button')
  await user.click(button)

  expect(onClick).toHaveBeenCalledOnce()
  expect(ref.current).toBe(button)
  expect(button).toHaveClass('mine')
})
