// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { categoryVars } from './src/lib/categories.ts'
import { THEME_COLORS } from './src/lib/themeColors.ts'

// Read from disk: under Vitest a `?raw` import of a .css file is empty.
const html = readFileSync('index.html', 'utf8')
const tokens = readFileSync('src/styles/tokens.css', 'utf8')
const manifest = JSON.parse(
  readFileSync('public/site.webmanifest', 'utf8'),
) as Record<string, unknown>

describe('inline theme script', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

  function runWithMeta(
    getItem: (key: string) => string | null,
    systemDark: boolean,
  ) {
    const documentElement = { dataset: {} as Record<string, string> }
    const meta = new Map<string, string>()
    runInNewContext(script, {
      document: {
        documentElement,
        querySelector: (selector: string) =>
          selector === 'meta[name="theme-color"]'
            ? {
                setAttribute: (name: string, value: string) =>
                  meta.set(name, value),
              }
            : null,
      },
      localStorage: { getItem },
      matchMedia: (query: string) => ({
        matches: query === '(prefers-color-scheme: dark)' && systemDark,
      }),
    })
    return { theme: documentElement.dataset.theme, color: meta.get('content') }
  }

  function run(getItem: (key: string) => string | null, systemDark: boolean) {
    return runWithMeta(getItem, systemDark).theme
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

  it.each([true, false])(
    'sets the theme colour for the theme (dark: %s)',
    (dark) => {
      const { theme, color } = runWithMeta(() => null, dark)
      expect(color).toBe(THEME_COLORS[theme as 'light' | 'dark'])
    },
  )
})

describe('theme colours', () => {
  function bg(selector: string) {
    const start = tokens.indexOf(`${selector} {`)
    const block = tokens.slice(start, tokens.indexOf('}', start))
    return /--bg: (#[0-9a-f]{6});/.exec(block)?.[1]
  }

  it('are the page background of each theme', () => {
    expect(THEME_COLORS.light).toBe(bg(':root'))
    expect(THEME_COLORS.dark).toBe(bg(":root[data-theme='dark']"))
  })

  it('start as the light one in index.html', () => {
    expect(html).toContain(
      `<meta name="theme-color" content="${THEME_COLORS.light}" />`,
    )
  })

  it('are the light one in the manifest', () => {
    expect(manifest['theme_color']).toBe(THEME_COLORS.light)
    expect(manifest['background_color']).toBe(THEME_COLORS.light)
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
