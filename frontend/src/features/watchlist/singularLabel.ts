// One title, so singular, unlike the chips' categoryLabel.
const SINGULAR_LABELS = new Map([
  ['movie', 'Movie'],
  ['series', 'Series'],
  ['game', 'Game'],
  ['anime:series', 'Anime series'],
  ['anime:movie', 'Anime movie'],
  ['manga', 'Manga'],
  ['book', 'Book'],
])

/** A card's or a title's category, such as "Anime series". */
export function singularLabel(category: string) {
  return SINGULAR_LABELS.get(category) ?? category
}
