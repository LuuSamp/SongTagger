import { LibraryUnavailableError, type LibraryService } from './LibraryService'

function unavailable(): Promise<never> {
  return Promise.reject(new LibraryUnavailableError())
}

export function createUnavailableLibrary(): LibraryService {
  return {
    kind: 'unavailable',
    resolveUser: unavailable,
    listPlaylists: unavailable,
    getPlaylist: unavailable,
    createPlaylist: unavailable,
    renamePlaylist: unavailable,
    deletePlaylist: unavailable,
    addSong: unavailable,
    removeSong: unavailable,
    reorder: unavailable,
    listFavorites: unavailable,
    addFavorite: unavailable,
    removeFavorite: unavailable,
  }
}
