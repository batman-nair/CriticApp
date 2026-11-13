import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { makeSearchResult } from '../../test/fixtures'
import { RatePlaceholder } from './RatePlaceholder'

it('names the picked title', () => {
  const { container } = render(<RatePlaceholder item={makeSearchResult()} />)

  expect(container).toHaveTextContent(
    'Rating comes next for The Witcher 3: Wild Hunt.',
  )
})
