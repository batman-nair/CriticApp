import { describe, expect, it } from 'vitest'
import { loginPath, safeNext } from './next'

describe('safeNext', () => {
  it.each(['/add', '/reviews/5?x=1#a', '/'])('accepts %s', (path) => {
    expect(safeNext(path)).toBe(path)
  })

  it.each([
    null,
    '',
    '//evil.com',
    '/\\evil.com',
    'https://evil.com/x',
    'javascript:alert(1)',
    'evil.com',
    '/login',
    '/login?next=/add',
    '/\tevil',
    '/add\n',
  ])('rejects %j', (raw) => {
    expect(safeNext(raw)).toBe('/')
  })
})

describe('loginPath', () => {
  it('is the bare login page without next', () => {
    expect(loginPath()).toBe('/login')
  })

  it('encodes next so it reads back unchanged', () => {
    const path = loginPath('/reviews/5?x=1&y=2#a')
    const url = new URL(path, window.location.origin)

    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('next')).toBe('/reviews/5?x=1&y=2#a')
    expect(loginPath('/add')).toBe('/login?next=%2Fadd')
  })
})
