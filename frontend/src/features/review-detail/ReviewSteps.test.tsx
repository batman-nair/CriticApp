import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { makeItem, makeReview } from '../../test/fixtures'
import { ReviewSteps } from './ReviewSteps'

type Props = ComponentProps<typeof ReviewSteps>

function renderSteps(overrides: Partial<Props> = {}) {
  const props: Props = {
    previous: makeReview({ id: 1, item: makeItem({ title: 'Akira' }) }),
    next: makeReview({ id: 3, item: makeItem({ title: 'Paprika' }) }),
    canGoPrevious: true,
    canGoNext: true,
    isLoadingNext: false,
    goPrevious: vi.fn(),
    goNext: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<ReviewSteps {...props} />) }
}

const previousButton = () =>
  screen.getByRole('button', { name: /^Previous review/ })
const nextButton = () => screen.getByRole('button', { name: /^Next review/ })

it('names each button after the review it goes to', () => {
  renderSteps()

  expect(previousButton()).toHaveAccessibleName('Previous review: Akira')
  expect(nextButton()).toHaveAccessibleName('Next review: Paprika')
  expect(previousButton()).not.toHaveAttribute('aria-disabled')
  expect(nextButton()).not.toHaveAttribute('aria-busy')
})

it('has plain names when the neighbour isn’t loaded', () => {
  renderSteps({ previous: undefined, next: undefined })

  expect(previousButton()).toHaveAccessibleName('Previous review')
  expect(nextButton()).toHaveAccessibleName('Next review')
})

it('calls back on a press', async () => {
  const user = userEvent.setup()
  const { props } = renderSteps()

  await user.click(previousButton())
  await user.click(nextButton())

  expect(props.goPrevious).toHaveBeenCalledOnce()
  expect(props.goNext).toHaveBeenCalledOnce()
})

it('marks the ends aria-disabled, and keeps them focusable', async () => {
  const user = userEvent.setup()
  renderSteps({ canGoPrevious: false, canGoNext: false })

  expect(previousButton()).toHaveAttribute('aria-disabled', 'true')
  expect(nextButton()).toHaveAttribute('aria-disabled', 'true')
  expect(nextButton()).toBeEnabled()
  await user.click(nextButton())
  expect(nextButton()).toHaveFocus()
})

it('marks › busy while the next page loads', () => {
  renderSteps({ next: undefined, isLoadingNext: true })

  expect(nextButton()).toHaveAttribute('aria-busy', 'true')
})

it('has no axe violations', async () => {
  const { container } = renderSteps({ canGoPrevious: false })

  await expectNoAxeViolations(container)
})
