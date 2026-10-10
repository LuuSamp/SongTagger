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

export function playlistSongSummary(song: PlaylistSong): SongSummary {
  return { id: song.song_id, title: song.title, artist_credit: song.artist_credit, tags: [] }
}

export function containsSong(playlist: Playlist, songId: number): boolean {
  return playlist.songs.some((song) => song.song_id === songId)
}

export function firstMembership(playlist: Playlist, songId: number): PlaylistSong | null {
  return playlist.songs.find((song) => song.song_id === songId) ?? null
}

export function movedMembershipIds(
  playlist: Playlist,
  membershipId: number,
  offset: -1 | 1,
): number[] | null {
  const ids = playlist.songs.map((song) => song.membership_id)
  const from = ids.indexOf(membershipId)
  const to = from + offset
  if (from < 0 || to < 0 || to >= ids.length) {
    return null
  }
  const reordered = [...ids]
  reordered.splice(from, 1)
  reordered.splice(to, 0, membershipId)
  return reordered
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
