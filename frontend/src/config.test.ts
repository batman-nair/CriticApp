import { expect, it } from 'vitest'
import { readOwnerUsername } from './config'

it('returns the trimmed username', () => {
  expect(readOwnerUsername('  devuser \n')).toBe('devuser')
})

it.each([undefined, '', '  '])('throws for %j', (value) => {
  expect(() => readOwnerUsername(value)).toThrow('VITE_OWNER_USERNAME')
})
