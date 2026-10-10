import { createContext, useContext } from 'react'
import type { Library, Playlist, SongSummary } from '../domain/library'
import type { CatalogService } from '../services/catalog'
import type { LibrarySourceKind } from '../services/library'

export interface Session {
  username: string
}

export const SessionContext = createContext<Session | null>(null)
export const CatalogContext = createContext<CatalogService | null>(null)

export interface LibraryActions {
  kind: LibrarySourceKind
  library: Library
  isFavorite: (songId: number) => boolean
  toggleFavorite: (song: SongSummary) => void
  createPlaylist: (name: string) => Playlist | null
  deletePlaylist: (playlistId: string) => void
  addToPlaylist: (playlistId: string, song: SongSummary) => void
  removeFromPlaylist: (playlistId: string, songId: number) => void
  playlistsContaining: (songId: number) => Playlist[]
}

export const LibraryContext = createContext<LibraryActions | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) {
    throw new Error('useSession must be used inside AppProviders')
  }
  return session
}

export function useCatalog(): CatalogService {
  const catalog = useContext(CatalogContext)
  if (!catalog) {
    throw new Error('useCatalog must be used inside AppProviders')
  }
  return catalog
}

export function useLibrary(): LibraryActions {
  const library = useContext(LibraryContext)
  if (!library) {
    throw new Error('useLibrary must be used inside AppProviders')
  }
  return library
}
