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

// Static, like TOKENS, so a card doesn't wait on /categories.
const LABELS = new Map([
  ['movie', 'Movies'],
  ['series', 'Series'],
  ['game', 'Games'],
  ['anime', 'Anime series'],
  ['anime:series', 'Anime series'],
  ['anime:movie', 'Anime movies'],
  ['manga', 'Manga'],
  ['book', 'Books'],
])

/**
 * The category id for a reviewed item. Anime is split into series and movies
 * the way the backend's `anime:movie` filter does it. Takes plain strings, not
 * an Item, because ui/ imports this file and must not depend on api/.
 */
export function reviewCategory(
  category: string,
  mediaType?: string | null,
): string {
  if (category !== 'anime') return category
  return mediaType?.toLowerCase() === 'movie' ? 'anime:movie' : 'anime:series'
}

/** The category's name on a card, or the id when it isn't known. */
export function categoryLabel(id: string): string {
  return LABELS.get(id) ?? id
}
