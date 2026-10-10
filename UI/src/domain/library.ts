import type { CatalogSong, Tag } from './types'

export interface SongSummary {
  id: number
  title: string
  artist_credit: string
  tags: Tag[]
}

export interface Playlist {
  id: string
  name: string
  createdAt: string
  songs: SongSummary[]
}

export interface Library {
  favorites: SongSummary[]
  playlists: Playlist[]
}

export const EMPTY_LIBRARY: Library = { favorites: [], playlists: [] }

export function toSongSummary(song: SongSummary | CatalogSong): SongSummary {
  return {
    id: song.id,
    title: song.title,
    artist_credit: song.artist_credit,
    tags: song.tags.map(({ kind, name, token }) => ({ kind, name, token })),
  }
}

export function isFavorite(library: Library, songId: number): boolean {
  return library.favorites.some((song) => song.id === songId)
}

export function toggleFavorite(library: Library, song: SongSummary): Library {
  if (isFavorite(library, song.id)) {
    return { ...library, favorites: library.favorites.filter((entry) => entry.id !== song.id) }
  }
  return { ...library, favorites: [toSongSummary(song), ...library.favorites] }
}

export function createPlaylist(library: Library, playlist: Playlist): Library {
  return { ...library, playlists: [playlist, ...library.playlists] }
}

export function deletePlaylist(library: Library, playlistId: string): Library {
  return {
    ...library,
    playlists: library.playlists.filter((playlist) => playlist.id !== playlistId),
  }
}

function updatePlaylist(
  library: Library,
  playlistId: string,
  change: (playlist: Playlist) => Playlist,
): Library {
  return {
    ...library,
    playlists: library.playlists.map((playlist) =>
      playlist.id === playlistId ? change(playlist) : playlist,
    ),
  }
}

export function addToPlaylist(library: Library, playlistId: string, song: SongSummary): Library {
  return updatePlaylist(library, playlistId, (playlist) =>
    playlist.songs.some((entry) => entry.id === song.id)
      ? playlist
      : { ...playlist, songs: [...playlist.songs, toSongSummary(song)] },
  )
}

export function removeFromPlaylist(library: Library, playlistId: string, songId: number): Library {
  return updatePlaylist(library, playlistId, (playlist) => ({
    ...playlist,
    songs: playlist.songs.filter((entry) => entry.id !== songId),
  }))
}

export function playlistsContaining(library: Library, songId: number): Playlist[] {
  return library.playlists.filter((playlist) => playlist.songs.some((song) => song.id === songId))
}

export function isLibrary(value: unknown): value is Library {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<Library>
  return Array.isArray(candidate.favorites) && Array.isArray(candidate.playlists)
}
