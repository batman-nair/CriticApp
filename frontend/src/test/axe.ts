import axe from 'axe-core'
import { expect } from 'vitest'

export async function expectNoAxeViolations(container: Element) {
  const { violations } = await axe.run(container, {
    // Needs canvas, which jsdom doesn't have.
    rules: { 'color-contrast': { enabled: false } },
  })
  expect(violations).toEqual([])
}
