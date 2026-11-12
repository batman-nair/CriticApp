/**
 * "2018", or "2018–2021" with an en dash, and empty without a start year. An
 * ongoing title shows its start year alone, never "2018–".
 */
export function formatYears(start: number | null, end: number | null): string {
  if (start === null) return ''
  if (end === null || end === start) return String(start)
  return `${start}–${end}`
}

// MyAnimeList's media types that are acronyms, as in "tv_special".
const ACRONYM_MEDIA_TYPES = new Set(['tv', 'ova', 'ona', 'cm', 'pv', 'oel'])

/**
 * A provider's media type as a label: "TV" and "OVA" upper-cased, otherwise
 * "light_novel" as "Light novel". Empty when there's nothing to say.
 */
export function formatMediaType(value: string | null): string {
  const type = value?.trim() ?? ''
  if (type === '' || type.toLowerCase() === 'unknown') return ''
  const words = type
    .split('_')
    .map((word) =>
      ACRONYM_MEDIA_TYPES.has(word.toLowerCase()) ? word.toUpperCase() : word,
    )
    .join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
