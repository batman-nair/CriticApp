/**
 * "2018", or "2018–2021" with an en dash, and empty without a start year. An
 * ongoing title shows its start year alone, never "2018–".
 */
export function formatYears(start: number | null, end: number | null): string {
  if (start === null) return ''
  if (end === null || end === start) return String(start)
  return `${start}–${end}`
}
