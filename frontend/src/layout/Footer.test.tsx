import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Footer } from './Footer'

it.each([
  ['Arjun Nair', 'https://batmannair.com'],
  ['GitHub', 'https://github.com/batman-nair/CriticApp'],
])('links %s to %s', (name, href) => {
  render(<Footer />)
  expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
})

it('credits the data sources, without RAWG', () => {
  const { container } = render(<Footer />)
  expect(
    screen.getByText('Data from OMDb, IGDB, MyAnimeList and Open Library'),
  ).toBeInTheDocument()
  expect(container).not.toHaveTextContent('RAWG')
})
