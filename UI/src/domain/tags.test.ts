import { describe, expect, it } from 'vitest'
import { groupTagsByKind, normalizeTagName, parseTokens, toToken, visibleTags } from './tags'
import type { Tag, UserTag } from './types'

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

describe('visibleTags', () => {
  const tags: UserTag[] = [
    { kind: 'artist', name: 'Jobim', token: 'jobim', applied_by_me: false },
    { kind: 'genre', name: 'Bossa Nova', token: 'bossa-nova', applied_by_me: false },
    { kind: 'genre', name: 'Jazz', token: 'jazz', applied_by_me: false },
    { kind: 'genre', name: 'Latin', token: 'latin', applied_by_me: false },
    { kind: 'feeling', name: 'Sunny', token: 'sunny', applied_by_me: true },
  ]

  it('returns everything when under the limit', () => {
    expect(visibleTags(tags, 8)).toHaveLength(5)
  })

  it('keeps the caller tags visible and preserves kind order', () => {
    expect(visibleTags(tags, 3).map((tag) => tag.token)).toEqual(['jobim', 'bossa-nova', 'sunny'])
  })
})
