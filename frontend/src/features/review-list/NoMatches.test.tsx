import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { NoMatches } from './NoMatches'

it('says nothing matches and how to widen the search', () => {
  render(<NoMatches />)

  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'Haven’t reviewed anything like that',
    }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Try another word, or widen the category or language.'),
  ).toBeInTheDocument()
})

it('has no axe violations', async () => {
  const { container } = render(<NoMatches />)

  await expectNoAxeViolations(container)
})
