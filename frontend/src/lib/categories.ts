import type { CSSProperties } from 'react'

type CategoryVars = CSSProperties & Record<'--cat' | '--cat-base', string>

const TOKENS = new Map([
  ['movie', 'movie'],
  ['series', 'series'],
  ['game', 'game'],
  // Items only say "anime"; the subcategories are filter ids.
  ['anime', 'anime-series'],
  ['anime:series', 'anime-series'],
  ['anime:movie', 'anime-movie'],
  ['manga', 'manga'],
  ['book', 'book'],
])

/** The CSS variables for a category, to pass as an element's `style`. */
export function categoryVars(id: string): CategoryVars {
  const token = TOKENS.get(id)
  if (!token) return { '--cat': 'var(--muted)', '--cat-base': 'var(--muted)' }
  return {
    '--cat': `var(--cat-${token})`,
    '--cat-base': `var(--cat-${token}-base)`,
  }
}
