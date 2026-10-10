import type {
  FavoriteList,
  FavoriteSong,
  LibraryUser,
  Playlist,
  PlaylistList,
  SpotifyExportResult,
  SpotifyImportResult,
  SpotifyPlaylistList,
} from '../../domain/library'
import { ApiError, type HttpClient } from '../http/httpClient'
import {
  FavoritesUnsupportedError,
  SpotifyNotConnectedError,
  type LibraryService,
} from './LibraryService'

const NOT_CONNECTED = 'Spotify is not connected'

export function createHttpLibrary(
  http: HttpClient,
  username: string,
  apiBaseUrl = '',
): LibraryService {
  let userRequest: Promise<LibraryUser> | null = null

  function resolveUser(): Promise<LibraryUser> {
    if (!userRequest) {
      userRequest = http.get<LibraryUser>(`/users/${encodeURIComponent(username)}`)
      userRequest.catch(() => {
        userRequest = null
      })
    }
    return userRequest
  }

  async function userPath(suffix: string): Promise<string> {
    const user = await resolveUser()
    return `/user/${user.id}${suffix}`
  }

  async function favorites<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.message === 'Not Found') {
        throw new FavoritesUnsupportedError()
      }
      throw error
    }
  }

  async function spotify<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request()
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.message === NOT_CONNECTED) {
        throw new SpotifyNotConnectedError()
      }
      throw error
    }
  }

  function playlistsPath(suffix = ''): Promise<string> {
    return userPath(`/playlist${suffix}`)
  }

  return {
    kind: 'http',
    resolveUser,
    async listPlaylists() {
      return http.get<PlaylistList>(await playlistsPath())
    },
    async getPlaylist(playlistId) {
      return http.get<Playlist>(await playlistsPath(`/${playlistId}`))
    },
    async createPlaylist(name) {
      return http.post<Playlist>(await playlistsPath(), { name })
    },
    async renamePlaylist(playlistId, name) {
      return http.patch<Playlist>(await playlistsPath(`/${playlistId}`), { name })
    },
    async deletePlaylist(playlistId) {
      await http.delete(await playlistsPath(`/${playlistId}`))
    },
    async addSong(playlistId, songId) {
      return http.post<Playlist>(await playlistsPath(`/${playlistId}/song`), { song_id: songId })
    },
    async removeSong(playlistId, membershipId) {
      await http.delete(await playlistsPath(`/${playlistId}/song/${membershipId}`))
    },
    async reorder(playlistId, membershipIds) {
      return http.put<Playlist>(await playlistsPath(`/${playlistId}/order`), {
        membership_ids: membershipIds,
      })
    },
    async listFavorites() {
      const path = await userPath('/favorite')
      return favorites(() => http.get<FavoriteList>(path))
    },
    async addFavorite(songId) {
      const path = await userPath(`/favorite/${songId}`)
      return favorites(() => http.put<FavoriteSong>(path, {}))
    },
    async removeFavorite(songId) {
      const path = await userPath(`/favorite/${songId}`)
      await favorites(() => http.delete(path))
    },
    async spotifyConnectUrl() {
      return `${apiBaseUrl}${await userPath('/spotify/start')}`
    },
    async listSpotifyPlaylists() {
      const path = await userPath('/spotify/playlists')
      return spotify(() => http.get<SpotifyPlaylistList>(path))
    },
    async importSpotifyPlaylist(spotifyPlaylistId) {
      const path = await playlistsPath('/spotify')
      return spotify(() =>
        http.post<SpotifyImportResult>(path, { spotify_playlist_id: spotifyPlaylistId }),
      )
    },
    async exportToSpotify(playlistId) {
      const path = await playlistsPath(`/${playlistId}/spotify`)
      return spotify(() => http.post<SpotifyExportResult>(path, {}))
    },
  }
}
