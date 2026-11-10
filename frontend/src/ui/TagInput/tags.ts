// The backend's rules (ReviewWriteSerializer.validate_tags). ui/ can't import
// from api/, and the server stays the source of truth.
const MAX_TAGS = 10
const MAX_TAG_LENGTH = 50
const MAX_JOINED_LENGTH = 100
const TAG_PATTERN = /^[A-Za-z0-9-]+$/

export function parseTags(text: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const part of text.split(',')) {
    const tag = part.trim()
    const key = tag.toLowerCase()
    if (tag !== '' && !seen.has(key)) {
      seen.add(key)
      tags.push(tag)
    }
  }
  return tags
}

// Through the join so a value holding a comma normalises like the text showing it.
export function normaliseTags(tags: string[]): string[] {
  return parseTags(tags.join(','))
}

// Takes a normalised list and returns the first rule it breaks.
export function validateTags(tags: string[]): string | undefined {
  if (tags.length > MAX_TAGS) {
    return `Use at most ${MAX_TAGS} tags.`
  }
  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    return `Each tag can be at most ${MAX_TAG_LENGTH} characters.`
  }
  if (tags.some((tag) => !TAG_PATTERN.test(tag))) {
    return 'Tags can only use letters, numbers and hyphens, separated by commas.'
  }
  if (tags.join(',').length > MAX_JOINED_LENGTH) {
    return `Together, the tags can be at most ${MAX_JOINED_LENGTH} characters, counting the commas.`
  }
  return undefined
}
