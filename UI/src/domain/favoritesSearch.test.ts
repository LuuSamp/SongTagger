import { describe, expect, it } from 'vitest'
import { filterSongs, topTags } from './favoritesSearch'
import type { Tag, TagKind } from './types'

function tag(kind: TagKind, name: string): Tag {
  return { kind, name, token: name.toLowerCase().replace(/ /g, '-') }
}

const songs = [
  {
    id: 1,
    title: 'Águas de Março',
    artist_credit: 'Elis Regina',
    tags: [tag('genre', 'MPB'), tag('feeling', 'Sunny'), tag('artist', 'Elis Regina')],
  },
  {
    id: 2,
    title: 'Teardrop',
    artist_credit: 'Massive Attack',
    tags: [tag('genre', 'trip hop'), tag('feeling', 'Late night'), tag('feeling', 'Dreamy')],
  },
  {
    id: 3,
    title: 'Smooth Operator',
    artist_credit: 'Sade',
    tags: [tag('feeling', 'Late night'), tag('instrument', 'Saxophone')],
  },
]

describe('filterSongs', () => {
  it('returns every song without a query', () => {
    expect(filterSongs(songs, null).map((song) => song.id)).toEqual([1, 2, 3])
  })

  it('keeps songs that have all the searched tags', () => {
    expect(filterSongs(songs, { mode: 'tags', tokens: ['late-night'] }).map((s) => s.id)).toEqual([
      2, 3,
    ])
    expect(
      filterSongs(songs, { mode: 'tags', tokens: ['late-night', 'trip-hop'] }).map((s) => s.id),
    ).toEqual([2])
    expect(filterSongs(songs, { mode: 'tags', tokens: ['mpb'] }).map((s) => s.id)).toEqual([1])
  })

  it('matches title and artist by substring, ignoring case and accents', () => {
    expect(
      filterSongs(songs, { mode: 'title', title: 'aguas', artist: '' }).map((s) => s.id),
    ).toEqual([1])
    expect(
      filterSongs(songs, { mode: 'title', title: 'o', artist: 'sade' }).map((s) => s.id),
    ).toEqual([3])
    expect(filterSongs(songs, { mode: 'title', title: 'nothing', artist: '' })).toEqual([])
  })
})

describe('topTags', () => {
  it('ranks shared non-artist tags first and keeps first-seen order on ties', () => {
    expect(topTags(songs, 4)).toEqual(['late-night', 'mpb', 'sunny', 'trip-hop'])
  })
})
