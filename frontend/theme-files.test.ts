// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { categoryVars } from './src/lib/categories.ts'

// Read from disk: under Vitest a `?raw` import of a .css file is empty.
const html = readFileSync('index.html', 'utf8')
const tokens = readFileSync('src/styles/tokens.css', 'utf8')

describe('inline theme script', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

  function run(getItem: (key: string) => string | null, systemDark: boolean) {
    const documentElement = { dataset: {} as Record<string, string> }
    runInNewContext(script, {
      document: { documentElement },
      localStorage: { getItem },
      matchMedia: (query: string) => ({
        matches: query === '(prefers-color-scheme: dark)' && systemDark,
      }),
    })
    return documentElement.dataset.theme
  }

  it('comes before the module script', () => {
    expect(script).not.toBe('')
    expect(html.indexOf(script)).toBeLessThan(html.indexOf('type="module"'))
  })

  it('prefers the stored choice over the system', () => {
    const stored = (key: string) => (key === 'critic-theme' ? 'light' : null)
    expect(run(stored, true)).toBe('light')
  })

  it.each([
    [true, 'dark'],
    [false, 'light'],
  ])('follows the system when nothing is stored (dark: %s)', (dark, theme) => {
    expect(run(() => null, dark)).toBe(theme)
  })

  it('follows the system for an invalid stored value', () => {
    expect(run(() => 'purple', true)).toBe('dark')
  })

  it('follows the system when storage throws', () => {
    const blocked = () => {
      throw new Error('Blocked')
    }
    expect(run(blocked, true)).toBe('dark')
  })
})

it.each([
  'movie',
  'series',
  'game',
  'anime',
  'anime:series',
  'anime:movie',
  'manga',
  'book',
  'unknown',
])('defines the variables for category %s', (id) => {
  const { '--cat': accent, '--cat-base': base } = categoryVars(id)
  for (const value of [accent, base]) {
    const name = /^var\((--[\w-]+)\)$/.exec(value)?.[1]
    expect(tokens).toContain(`${name}:`)
  }
})
