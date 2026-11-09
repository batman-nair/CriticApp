import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { RatingBadge } from './RatingBadge'

it('shows the rating out of 10', () => {
  const { container } = render(<RatingBadge rating={9.5} category="movie" />)

  expect(container.textContent).toBe('9.5 /10')
})

it('formats an integer with one decimal', () => {
  const { container } = render(<RatingBadge rating={9} category="movie" />)

  expect(container.textContent).toBe('9.0 /10')
})

it('shows only "Not rated" to assistive tech without a rating', () => {
  render(<RatingBadge rating={null} category="movie" />)

  expect(screen.getByText('Not rated')).toBeInTheDocument()
  expect(screen.getByText('–.–')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByText('/10')).toHaveAttribute('aria-hidden', 'true')
})

it('applies the category variables on both variants', () => {
  const { container, rerender } = render(
    <RatingBadge rating={7} category="movie" />,
  )
  const cat = () =>
    (container.firstChild as HTMLElement).style.getPropertyValue('--cat-base')
  expect(cat()).toBe('var(--cat-movie-base)')

  rerender(
    <RatingBadge
      variant="provider"
      provider="IMDb"
      rating={7}
      category="game"
    />,
  )
  expect(cat()).toBe('var(--cat-game-base)')
})

it('shows the provider and its rating', () => {
  const { container } = render(
    <RatingBadge
      variant="provider"
      provider="IMDb"
      rating={6.5}
      category="movie"
    />,
  )

  expect(container.textContent).toBe('IMDb 6.5')
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

it('renders nothing for a provider without a rating', () => {
  const { container } = render(
    <RatingBadge
      variant="provider"
      provider="IMDb"
      rating={null}
      category="movie"
    />,
  )

  expect(container).toBeEmptyDOMElement()
})

it('has no axe violations', async () => {
  const { container } = render(
    <>
      <RatingBadge rating={9.5} category="movie" />
      <RatingBadge rating={null} category="movie" />
      <RatingBadge
        variant="provider"
        provider="IMDb"
        rating={6.5}
        category="movie"
      />
    </>,
  )

  await expectNoAxeViolations(container)
})
