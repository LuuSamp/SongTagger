import { describe, expect, it } from 'vitest'
import { topInterests } from './interests'
import {
  applyOrder,
  containsSong,
  distinctSongIds,
  firstMembership,
  movedMembershipIds,
  reorderedMembershipIds,
  type Playlist,
  type SongSummary,
} from './library'

const noite: Playlist = {
  id: 7,
  name: 'Noite',
  created_at: '2026-10-10T12:00:00',
  songs: [
    { membership_id: 11, position: 1, song_id: 6, title: 'So What', artist_credit: 'Miles Davis' },
    { membership_id: 12, position: 2, song_id: 1, title: 'Sampa', artist_credit: 'Caetano Veloso' },
    { membership_id: 13, position: 3, song_id: 6, title: 'So What', artist_credit: 'Miles Davis' },
  ],
}

describe('playlist helpers', () => {
  it('finds songs and their first membership, duplicates included', () => {
    expect(containsSong(noite, 6)).toBe(true)
    expect(containsSong(noite, 99)).toBe(false)
    expect(firstMembership(noite, 6)?.membership_id).toBe(11)
  })

  it('builds the full membership order for a move, refusing moves past the ends', () => {
    expect(movedMembershipIds(noite, 12, -1)).toEqual([12, 11, 13])
    expect(movedMembershipIds(noite, 12, 1)).toEqual([11, 13, 12])
    expect(movedMembershipIds(noite, 11, -1)).toBeNull()
    expect(movedMembershipIds(noite, 13, 1)).toBeNull()
  })

  it('moves a membership to any index, shifting the songs in between', () => {
    expect(reorderedMembershipIds(noite, 13, 0)).toEqual([13, 11, 12])
    expect(reorderedMembershipIds(noite, 11, 2)).toEqual([12, 13, 11])
    expect(reorderedMembershipIds(noite, 11, 1)).toEqual([12, 11, 13])
    expect(reorderedMembershipIds(noite, 12, 1)).toBeNull()
    expect(reorderedMembershipIds(noite, 99, 0)).toBeNull()
    expect(reorderedMembershipIds(noite, 11, 3)).toBeNull()
  })

  it('applies an order and renumbers positions', () => {
    const reordered = applyOrder(noite, [13, 11, 12])
    expect(reordered.songs.map((song) => [song.membership_id, song.position])).toEqual([
      [13, 1],
      [11, 2],
      [12, 3],
    ])
  })

  it('lists distinct song ids across playlists up to a limit', () => {
    expect(distinctSongIds([noite], 10)).toEqual([6, 1])
    expect(distinctSongIds([noite], 1)).toEqual([6])
  })
})

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

describe('topInterests', () => {
  it('puts tags shared by several songs first, then alternates between songs', () => {
    const interests = topInterests([sampa, baby], 3)
    expect(interests.map((interest) => interest.token)).toEqual(['mpb', 'warm', 'guitar'])
  })

  it('draws from every song when nothing is shared', () => {
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

  it('returns nothing without songs', () => {
    expect(topInterests([])).toEqual([])
  })
})
