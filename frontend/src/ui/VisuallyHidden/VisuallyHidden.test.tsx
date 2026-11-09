import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { VisuallyHidden } from './VisuallyHidden'
import styles from './VisuallyHidden.module.css'

it('renders its children in a span with the hiding class', () => {
  render(<VisuallyHidden>Not rated</VisuallyHidden>)

  const element = screen.getByText('Not rated')
  expect(element.tagName).toBe('SPAN')
  expect(element.className).toBe(styles.root)
})

it('contributes to the accessible name of its parent', () => {
  render(
    <button type="button">
      <VisuallyHidden>Close</VisuallyHidden>
    </button>,
  )

  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
})
