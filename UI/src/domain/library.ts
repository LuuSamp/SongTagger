import type { Tag } from './types'

export interface SongSummary {
  id: number
  title: string
  artist_credit: string
  tags: Tag[]
}

export interface LibraryUser {
  id: number
  username: string
}

export interface PlaylistSummary {
  id: number
  name: string
  created_at: string
}

export interface PlaylistSong {
  membership_id: number
  position: number
  song_id: number
  title: string
  artist_credit: string
}

export interface Playlist extends PlaylistSummary {
  songs: PlaylistSong[]
}

export interface PlaylistList {
  playlists: PlaylistSummary[]
}

export interface FavoriteSong {
  song_id: number
  title: string
  artist_credit: string
  favorited_at: string
}

export interface FavoriteList {
  songs: FavoriteSong[]
}

export function favoriteSongSummary(song: FavoriteSong): SongSummary {
  return { id: song.song_id, title: song.title, artist_credit: song.artist_credit, tags: [] }
}

export function playlistSongSummary(song: PlaylistSong): SongSummary {
  return { id: song.song_id, title: song.title, artist_credit: song.artist_credit, tags: [] }
}

export function containsSong(playlist: Playlist, songId: number): boolean {
  return playlist.songs.some((song) => song.song_id === songId)
}

export function firstMembership(playlist: Playlist, songId: number): PlaylistSong | null {
  return playlist.songs.find((song) => song.song_id === songId) ?? null
}

export function reorderedMembershipIds(
  playlist: Playlist,
  membershipId: number,
  toIndex: number,
): number[] | null {
  const ids = playlist.songs.map((song) => song.membership_id)
  const from = ids.indexOf(membershipId)
  if (from < 0 || toIndex < 0 || toIndex >= ids.length || toIndex === from) {
    return null
  }
  const reordered = [...ids]
  reordered.splice(from, 1)
  reordered.splice(toIndex, 0, membershipId)
  return reordered
}

export function movedMembershipIds(
  playlist: Playlist,
  membershipId: number,
  offset: -1 | 1,
): number[] | null {
  const from = playlist.songs.findIndex((song) => song.membership_id === membershipId)
  return from < 0 ? null : reorderedMembershipIds(playlist, membershipId, from + offset)
}

export function applyOrder(playlist: Playlist, membershipIds: readonly number[]): Playlist {
  const byId = new Map(playlist.songs.map((song) => [song.membership_id, song]))
  const songs = membershipIds.flatMap((id, index) => {
    const song = byId.get(id)
    return song ? [{ ...song, position: index + 1 }] : []
  })
  return { ...playlist, songs }
}

export function distinctSongIds(playlists: readonly Playlist[], limit: number): number[] {
  const ids: number[] = []
  for (const playlist of playlists) {
    for (const song of playlist.songs) {
      if (!ids.includes(song.song_id)) {
        ids.push(song.song_id)
      }
    }
  }
  return ids.slice(0, limit)
}
