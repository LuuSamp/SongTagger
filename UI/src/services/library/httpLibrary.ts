import type { LibraryUser, Playlist, PlaylistList } from '../../domain/library'
import type { HttpClient } from '../http/httpClient'
import type { LibraryService } from './LibraryService'

export function createHttpLibrary(http: HttpClient, username: string): LibraryService {
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

  async function playlistsPath(suffix = ''): Promise<string> {
    const user = await resolveUser()
    return `/user/${user.id}/playlist${suffix}`
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
  }
}
