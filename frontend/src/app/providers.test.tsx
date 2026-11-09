import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useCategories } from '../api/queries/categories'
import { Providers } from './providers'

function FirstCategory() {
  const categories = useCategories()
  return <p>{categories.data?.[0]?.label}</p>
}

it('gives its children a working query client', async () => {
  render(
    <Providers>
      <FirstCategory />
    </Providers>,
  )
  expect(await screen.findByText('Movies')).toBeInTheDocument()
})
