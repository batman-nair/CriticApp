import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { expect, it } from 'vitest'
import { Skeleton } from './Skeleton'
import styles from './Skeleton.module.css'

function renderSkeleton(ui: ReactElement) {
  return render(ui).container.firstElementChild as HTMLElement
}

it('is always hidden from assistive technology', () => {
  expect(renderSkeleton(<Skeleton />)).toHaveAttribute('aria-hidden', 'true')
})

it('sets only the custom properties that were passed', () => {
  const element = renderSkeleton(<Skeleton height={20} />)

  expect(element.style.getPropertyValue('--skeleton-height')).toBe('20px')
  expect(element.style.getPropertyValue('--skeleton-width')).toBe('')
  expect(element.style.getPropertyValue('--skeleton-radius')).toBe('')
})

it('treats numbers as pixels and passes strings through', () => {
  const element = renderSkeleton(
    <Skeleton width={120} height="50%" radius={0} aspectRatio="2 / 3" />,
  )

  expect(element.style.getPropertyValue('--skeleton-width')).toBe('120px')
  expect(element.style.getPropertyValue('--skeleton-height')).toBe('50%')
  expect(element.style.getPropertyValue('--skeleton-radius')).toBe('0px')
  expect(element.style.getPropertyValue('--skeleton-aspect-ratio')).toBe(
    '2 / 3',
  )
})

it('passes the delay in seconds', () => {
  const element = renderSkeleton(<Skeleton delay={0.2} />)

  expect(element.style.getPropertyValue('--skeleton-delay')).toBe('0.2s')
})

it('merges a caller className', () => {
  const element = renderSkeleton(<Skeleton className="card" />)

  expect(element).toHaveClass('card')
  expect(element.className).toContain(styles.root)
})
