/**
 * "2018", or "2018–2021" with an en dash, and empty without a start year. An
 * ongoing title shows its start year alone, never "2018–".
 */
export function formatYears(start: number | null, end: number | null): string {
  if (start === null) return ''
  if (end === null || end === start) return String(start)
  return `${start}–${end}`
}

const ACRONYM_MEDIA_TYPES = new Set(['tv', 'ova', 'ona'])

/**
 * A provider's media type as a label: "TV" and "OVA" upper-cased, otherwise
 * "light_novel" as "Light novel". Empty when there's nothing to say.
 */
export function formatMediaType(value: string | null): string {
  const type = value?.trim() ?? ''
  if (type === '' || type.toLowerCase() === 'unknown') return ''
  if (ACRONYM_MEDIA_TYPES.has(type.toLowerCase())) return type.toUpperCase()
  const words = type.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
