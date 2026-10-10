import { describe, expect, it } from 'vitest'
import { topInterests } from './interests'
import {
  addToPlaylist,
  createPlaylist,
  EMPTY_LIBRARY,
  playlistsContaining,
  removeFromPlaylist,
  toggleFavorite,
  type SongSummary,
} from './library'

const sampa: SongSummary = {
  id: 1,
  title: 'Sampa',
  artist_credit: 'Caetano Veloso',
  tags: [
    { kind: 'artist', name: 'Caetano Veloso', token: 'caetano-veloso' },
    { kind: 'genre', name: 'MPB', token: 'mpb' },
    { kind: 'feeling', name: 'Warm', token: 'warm' },
  ],
}

const baby: SongSummary = {
  id: 5,
  title: 'Baby',
  artist_credit: 'Gal Costa',
  tags: [
    { kind: 'artist', name: 'Gal Costa', token: 'gal-costa' },
    { kind: 'genre', name: 'MPB', token: 'mpb' },
    { kind: 'instrument', name: 'Guitar', token: 'guitar' },
  ],
}

describe('library reducers', () => {
  it('toggles favorites without duplicating', () => {
    const once = toggleFavorite(EMPTY_LIBRARY, sampa)
    expect(once.favorites.map((song) => song.id)).toEqual([1])
    expect(toggleFavorite(once, sampa).favorites).toEqual([])
  })

  it('adds and removes playlist songs idempotently', () => {
    const withPlaylist = createPlaylist(EMPTY_LIBRARY, {
      id: 'p1',
      name: 'Noite',
      createdAt: '2026-10-10T00:00:00.000Z',
      songs: [],
    })
    const added = addToPlaylist(addToPlaylist(withPlaylist, 'p1', sampa), 'p1', sampa)
    expect(added.playlists[0]?.songs).toHaveLength(1)
    expect(playlistsContaining(added, 1).map((playlist) => playlist.name)).toEqual(['Noite'])
    expect(removeFromPlaylist(added, 'p1', 1).playlists[0]?.songs).toEqual([])
  })
})

describe('topInterests', () => {
  it('puts tags shared by several favorites first, then alternates between songs', () => {
    const interests = topInterests([sampa, baby], 3)
    expect(interests.map((interest) => interest.token)).toEqual(['mpb', 'warm', 'guitar'])
  })

  it('draws from every favorite when nothing is shared', () => {
    const soWhat: SongSummary = {
      id: 6,
      title: 'So What',
      artist_credit: 'Miles Davis',
      tags: [
        { kind: 'genre', name: 'Jazz', token: 'jazz' },
        { kind: 'genre', name: 'Cool Jazz', token: 'cool-jazz' },
        { kind: 'feeling', name: 'Contemplative', token: 'contemplative' },
      ],
    }
    const interests = topInterests([soWhat, sampa], 3)
    expect(interests.map((interest) => interest.token)).toEqual(['cool-jazz', 'mpb', 'jazz'])
  })

  it('returns nothing without favorites', () => {
    expect(topInterests([])).toEqual([])
  })
})
