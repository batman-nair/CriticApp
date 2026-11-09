import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { StatusDigit, StatusPage } from './StatusPage'

function renderPage() {
  return render(
    <StatusPage
      art={<StatusDigit tone="movie">4</StatusDigit>}
      title="Heading"
      text="Some text"
      actions={<button>Do it</button>}
    >
      <p>Below the actions</p>
    </StatusPage>,
  )
}

it('shows the heading, text, actions and children', () => {
  renderPage()
  expect(
    screen.getByRole('heading', { level: 1, name: 'Heading' }),
  ).toBeInTheDocument()
  expect(screen.getByText('Some text')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Do it' })).toBeInTheDocument()
  expect(screen.getByText('Below the actions')).toBeInTheDocument()
})

it('hides the art from assistive tech', () => {
  renderPage()
  expect(screen.getByText('4').parentElement).toHaveAttribute(
    'aria-hidden',
    'true',
  )
})
