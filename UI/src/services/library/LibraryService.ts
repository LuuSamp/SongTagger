import type { LibraryUser, Playlist, PlaylistList } from '../../domain/library'

export type LibrarySourceKind = 'http' | 'unavailable'

export interface LibraryService {
  readonly kind: LibrarySourceKind
  resolveUser(): Promise<LibraryUser>
  listPlaylists(): Promise<PlaylistList>
  getPlaylist(playlistId: number): Promise<Playlist>
  createPlaylist(name: string): Promise<Playlist>
  renamePlaylist(playlistId: number, name: string): Promise<Playlist>
  deletePlaylist(playlistId: number): Promise<void>
  addSong(playlistId: number, songId: number): Promise<Playlist>
  removeSong(playlistId: number, membershipId: number): Promise<void>
  reorder(playlistId: number, membershipIds: readonly number[]): Promise<Playlist>
}

export class LibraryUnavailableError extends Error {
  constructor() {
    super('The Library needs the SongTagger API. Run the UI with VITE_DATA_SOURCE=http.')
    this.name = 'LibraryUnavailableError'
  }
}
