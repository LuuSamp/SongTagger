import { createContext, useContext } from 'react'
import type {
  Playlist,
  SpotifyExportResult,
  SpotifyImportResult,
  SpotifyPlaylistList,
} from '../domain/library'
import type { CatalogService } from '../services/catalog'
import type { LibrarySourceKind } from '../services/library'
import type { FavoritesState } from './useFavoritesState'

export interface Session {
  username: string
}

export const SessionContext = createContext<Session | null>(null)
export const CatalogContext = createContext<CatalogService | null>(null)

export type LibraryStatus = 'loading' | 'ready' | 'unavailable' | 'error'

export interface LibraryActions extends FavoritesState {
  kind: LibrarySourceKind
  status: LibraryStatus
  loadError: string | null
  playlists: Playlist[]
  actionError: string | null
  pending: boolean
  reload: () => void
  clearActionError: () => void
  createPlaylist: (name: string) => Promise<Playlist | null>
  renamePlaylist: (playlistId: number, name: string) => Promise<boolean>
  deletePlaylist: (playlistId: number) => Promise<boolean>
  addSong: (playlistId: number, songId: number) => Promise<boolean>
  removeSong: (playlistId: number, songId: number) => Promise<boolean>
  removeMembership: (playlistId: number, membershipId: number) => Promise<boolean>
  moveSong: (playlistId: number, membershipId: number, offset: -1 | 1) => Promise<boolean>
  reorderSongs: (playlistId: number, membershipIds: readonly number[]) => Promise<boolean>
  playlistsContaining: (songId: number) => Playlist[]
  spotifyConnectUrl: () => Promise<string>
  listSpotifyPlaylists: () => Promise<SpotifyPlaylistList>
  importFromSpotify: (spotifyPlaylistId: string) => Promise<SpotifyImportResult>
  exportToSpotify: (playlistId: number) => Promise<SpotifyExportResult>
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
