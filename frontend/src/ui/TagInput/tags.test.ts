import { describe, expect, it } from 'vitest'
import { normaliseTags, parseTags, validateTags } from './tags'

const TOO_MANY = 'Use at most 10 tags.'
const TOO_LONG = 'Each tag can be at most 50 characters.'
const BAD_CHARACTERS =
  'Tags can only use letters, numbers and hyphens, separated by commas.'
const JOINED_TOO_LONG =
  'Together, the tags can be at most 100 characters, counting the commas.'

function numberedTags(count: number) {
  return Array.from({ length: count }, (_, index) => `t${index}`)
}

describe('parseTags', () => {
  it('splits on commas and trims', () => {
    expect(parseTags(' sci-fi ,favourite,  rewatch')).toEqual([
      'sci-fi',
      'favourite',
      'rewatch',
    ])
  })

  it('drops empty entries', () => {
    expect(parseTags('a,, ,b,')).toEqual(['a', 'b'])
  })

  it('drops case-insensitive duplicates, keeping the first spelling', () => {
    expect(parseTags('Sci-Fi, sci-fi, SCI-FI, b')).toEqual(['Sci-Fi', 'b'])
  })

  it('gives an empty list for empty text', () => {
    expect(parseTags('')).toEqual([])
  })
})

describe('normaliseTags', () => {
  it('drops duplicates', () => {
    expect(normaliseTags(['a', 'A', 'b'])).toEqual(['a', 'b'])
  })

  it('splits an entry holding a comma', () => {
    expect(normaliseTags(['a', 'b,c'])).toEqual(['a', 'b', 'c'])
  })
})

describe('validateTags', () => {
  it('passes an empty list', () => {
    expect(validateTags([])).toBeUndefined()
  })

  it('allows 10 tags and rejects 11', () => {
    expect(validateTags(numberedTags(10))).toBeUndefined()
    expect(validateTags(numberedTags(11))).toBe(TOO_MANY)
  })

  it('allows 50 characters and rejects 51', () => {
    expect(validateTags(['a'.repeat(50)])).toBeUndefined()
    expect(validateTags(['a'.repeat(51)])).toBe(TOO_LONG)
  })

  it.each(['sci fi', 'sci_fi', 'café', 'ＡＢＣ'])('rejects %s', (tag) => {
    expect(validateTags([tag])).toBe(BAD_CHARACTERS)
  })

  it('allows letters, numbers and hyphens', () => {
    expect(validateTags(['Sci-Fi-2049'])).toBeUndefined()
  })

  it('allows 100 joined characters and rejects 101', () => {
    const exactly100 = ['a'.repeat(50), 'b'.repeat(49)]
    expect(exactly100.join(',')).toHaveLength(100)
    expect(validateTags(exactly100)).toBeUndefined()

    const over = ['a'.repeat(50), 'b'.repeat(50)]
    expect(over.join(',')).toHaveLength(101)
    expect(validateTags(over)).toBe(JOINED_TOO_LONG)
  })

  it('reports the first failing rule when several fail', () => {
    const everything = [...numberedTags(10), 'a b', 'c'.repeat(51)]
    expect(validateTags(everything)).toBe(TOO_MANY)
    expect(validateTags(['a b', 'c'.repeat(51)])).toBe(TOO_LONG)
    expect(validateTags(['a b', 'c'.repeat(50), 'd'.repeat(50)])).toBe(
      BAD_CHARACTERS,
    )
  })
})
