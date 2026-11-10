import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { Stepper } from './Stepper'

const steps = ['Find', 'Rate', 'Write']

const items = () => screen.getAllByRole('listitem')

it('renders the steps in order inside a labelled list', () => {
  render(<Stepper label="Progress" steps={steps} current={0} />)

  expect(screen.getByRole('list', { name: 'Progress' })).toHaveAttribute(
    'role',
    'list',
  )
  expect(items().map((item) => item.textContent)).toEqual(steps)
})

it('marks only the current step', () => {
  render(<Stepper label="Progress" steps={steps} current={1} />)

  expect(items().map((item) => item.getAttribute('aria-current'))).toEqual([
    null,
    'step',
    null,
  ])
})

it('marks no step when all are done', () => {
  render(<Stepper label="Progress" steps={steps} current={steps.length} />)

  for (const item of items()) {
    expect(item).not.toHaveAttribute('aria-current')
  }
})

it('sets the category variables on the root', () => {
  render(
    <Stepper label="Progress" steps={steps} current={0} category="movie" />,
  )

  expect(screen.getByRole('list').style.getPropertyValue('--cat')).toBe(
    'var(--cat-movie)',
  )
})

it('sets no category variables without a category', () => {
  render(<Stepper label="Progress" steps={steps} current={0} />)

  expect(screen.getByRole('list')).not.toHaveAttribute('style')
})

it('has no axe violations', async () => {
  const { container } = render(
    <Stepper label="Progress" steps={steps} current={1} category="movie" />,
  )

  await expectNoAxeViolations(container)
})
