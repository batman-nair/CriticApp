import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Icon, type IconName } from './Icon'

const names: IconName[] = [
  'search',
  'moon',
  'sun',
  'plus',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'x',
  'pencil',
  'trash',
  'star',
  'lock',
  'cloud-off',
  'refresh',
  'alert-circle',
  'check',
]

it.each(names)(
  'renders %s as an aria-hidden svg with the given size',
  (name) => {
    const { container } = render(<Icon name={name} size={21} />)

    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '21')
    expect(svg).toHaveAttribute('height', '21')
    expect(svg?.childElementCount).toBeGreaterThan(0)
  },
)

it('fills the star without a stroke', () => {
  const { container } = render(<Icon name="star" />)

  expect(container.querySelector('svg')).not.toHaveAttribute('stroke')
  expect(container.querySelector('path')).toHaveAttribute(
    'fill',
    'currentColor',
  )
})

it('strokes the other icons and passes className through', () => {
  const { container } = render(
    <Icon name="plus" strokeWidth={1.9} className="mine" />,
  )

  const svg = container.querySelector('svg')
  expect(svg).toHaveAttribute('fill', 'none')
  expect(svg).toHaveAttribute('stroke', 'currentColor')
  expect(svg).toHaveAttribute('stroke-width', '1.9')
  expect(svg).toHaveClass('mine')
})
