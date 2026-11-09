import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { Poster } from './Poster'

const SRC = 'https://example.test/dune.jpg'
const OTHER_SRC = 'https://example.test/arrival.jpg'

it('renders the image lazily with its alt text', () => {
  render(<Poster src={SRC} title="Dune" alt="Dune poster" />)

  const image = screen.getByRole('img', { name: 'Dune poster' })
  expect(image.tagName).toBe('IMG')
  expect(image).toHaveAttribute('src', SRC)
  expect(image).toHaveAttribute('loading', 'lazy')
  expect(image).toHaveAttribute('decoding', 'async')
  expect(screen.queryByText('D')).not.toBeInTheDocument()
})

it('tints the placeholder by category', () => {
  const { container } = render(<Poster title="Dune" category="movie" />)

  const root = container.firstElementChild as HTMLElement
  expect(root.style.getPropertyValue('--cat-base')).toBe(
    'var(--cat-movie-base)',
  )
})

it('renders a decorative image with an empty alt', () => {
  const { container } = render(<Poster src={SRC} title="Dune" />)

  expect(container.querySelector('img')).toHaveAttribute('alt', '')
})

it.each([
  ['undefined', undefined],
  ['null', null],
  ['empty', ''],
])('shows the initial when src is %s', (_label, src) => {
  const { container } = render(<Poster src={src} title="dune" />)

  expect(container.querySelector('img')).not.toBeInTheDocument()
  expect(screen.getByText('D')).toBeInTheDocument()
})

it('shows the initial after the image fails', () => {
  const { container } = render(<Poster src={SRC} title="Dune" />)

  fireEvent.error(container.querySelector('img')!)

  expect(container.querySelector('img')).not.toBeInTheDocument()
  expect(screen.getByText('D')).toBeInTheDocument()
})

it('keeps the fallback when re-rendered with the same failed src', () => {
  const { container, rerender } = render(<Poster src={SRC} title="Dune" />)
  fireEvent.error(container.querySelector('img')!)

  rerender(<Poster src={SRC} title="Dune" />)

  expect(container.querySelector('img')).not.toBeInTheDocument()
  expect(screen.getByText('D')).toBeInTheDocument()
})

it('tries again when src changes after a failure', () => {
  const { container, rerender } = render(<Poster src={SRC} title="Dune" />)
  fireEvent.error(container.querySelector('img')!)

  rerender(<Poster src={OTHER_SRC} title="Dune" />)

  expect(container.querySelector('img')).toHaveAttribute('src', OTHER_SRC)
  expect(screen.queryByText('D')).not.toBeInTheDocument()
})

it('uses the first whole character of the trimmed title', () => {
  render(<Poster title="  😀 Movie" />)

  expect(screen.getByText('😀')).toBeInTheDocument()
})

it.each([
  ['empty', ''],
  ['blank', '   '],
])('shows ? for a %s title', (_label, title) => {
  render(<Poster title={title} />)

  expect(screen.getByText('?')).toBeInTheDocument()
})

it('names the fallback with a non-empty alt', () => {
  render(<Poster title="Dune" alt="Dune poster" />)

  const fallback = screen.getByRole('img', { name: 'Dune poster' })
  expect(fallback.tagName).not.toBe('IMG')
  expect(fallback).toHaveTextContent('D')
  expect(fallback).not.toHaveAttribute('aria-hidden')
})

it('hides the fallback without an alt', () => {
  render(<Poster title="Dune" />)

  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByText('D')).toHaveAttribute('aria-hidden', 'true')
})

it('merges the caller className', () => {
  const { container } = render(<Poster title="Dune" className="mine" />)

  expect(container.firstChild).toHaveClass('mine')
})

it('has no axe violations with an image', async () => {
  const { container } = render(
    <Poster src={SRC} title="Dune" alt="Dune poster" category="movie" />,
  )

  await expectNoAxeViolations(container)
})

it('has no axe violations with the fallback', async () => {
  const { container } = render(<Poster title="Dune" alt="Dune poster" />)

  await expectNoAxeViolations(container)
})

it('has no axe violations with a decorative fallback', async () => {
  const { container } = render(<Poster title="Dune" />)

  await expectNoAxeViolations(container)
})
