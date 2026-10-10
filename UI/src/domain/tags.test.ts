import { describe, expect, it } from 'vitest'
import { groupTagsByKind, normalizeTagName, parseTokens, toToken } from './tags'
import type { Tag } from './types'

describe('tag normalization', () => {
  it('folds accents, case and hyphens like the API', () => {
    expect(normalizeTagName('  Tropicália ')).toBe('tropicalia')
    expect(normalizeTagName('rock-and-roll')).toBe('rock and roll')
    expect(toToken('Bossa  Nova')).toBe('bossa-nova')
  })

  it('splits search input into unique tokens', () => {
    expect(parseTokens('MPB  sunny, mpb Late-Night')).toEqual(['mpb', 'sunny', 'late-night'])
    expect(parseTokens('   ')).toEqual([])
  })

  it('groups tags in API kind order', () => {
    const tags: Tag[] = [
      { kind: 'feeling', name: 'Warm', token: 'warm' },
      { kind: 'artist', name: 'Gal Costa', token: 'gal-costa' },
      { kind: 'genre', name: 'MPB', token: 'mpb' },
    ]
    expect(groupTagsByKind(tags).map(([kind]) => kind)).toEqual(['artist', 'genre', 'feeling'])
  })
})
