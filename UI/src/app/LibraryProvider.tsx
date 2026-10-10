import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as libraryOps from '../domain/library'
import type { Playlist, SongSummary } from '../domain/library'
import type { LibraryService } from '../services/library'
import { LibraryContext, type LibraryActions } from './contexts'

interface LibraryProviderProps {
  service: LibraryService
  children: ReactNode
}

function newPlaylistId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function LibraryProvider({ service, children }: LibraryProviderProps) {
  const [library, setLibrary] = useState(() => service.load())

  useEffect(() => {
    service.save(library)
  }, [service, library])

  const toggleFavorite = useCallback((song: SongSummary) => {
    setLibrary((current) => libraryOps.toggleFavorite(current, song))
  }, [])

  const createPlaylist = useCallback((name: string): Playlist | null => {
    const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, 80)
    if (!trimmed) {
      return null
    }
    const playlist: Playlist = {
      id: newPlaylistId(),
      name: trimmed,
      createdAt: new Date().toISOString(),
      songs: [],
    }
    setLibrary((current) => libraryOps.createPlaylist(current, playlist))
    return playlist
  }, [])

  const deletePlaylist = useCallback((playlistId: string) => {
    setLibrary((current) => libraryOps.deletePlaylist(current, playlistId))
  }, [])

  const addToPlaylist = useCallback((playlistId: string, song: SongSummary) => {
    setLibrary((current) => libraryOps.addToPlaylist(current, playlistId, song))
  }, [])

  const removeFromPlaylist = useCallback((playlistId: string, songId: number) => {
    setLibrary((current) => libraryOps.removeFromPlaylist(current, playlistId, songId))
  }, [])

  const value = useMemo<LibraryActions>(
    () => ({
      kind: service.kind,
      library,
      isFavorite: (songId) => libraryOps.isFavorite(library, songId),
      toggleFavorite,
      createPlaylist,
      deletePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      playlistsContaining: (songId) => libraryOps.playlistsContaining(library, songId),
    }),
    [
      service.kind,
      library,
      toggleFavorite,
      createPlaylist,
      deletePlaylist,
      addToPlaylist,
      removeFromPlaylist,
    ],
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}
