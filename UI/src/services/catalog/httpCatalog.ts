import type {
  CommunityFeed,
  Showcase,
  SongSearch,
  TagWrite,
  UserSong,
  UserSongList,
  UserTag,
} from '../../domain/types'
import type { HttpClient } from '../http/httpClient'
import type { CatalogService } from './CatalogService'

export function createHttpCatalog(http: HttpClient, username: string): CatalogService {
  const user = `/users/${encodeURIComponent(username)}`

  return {
    kind: 'http',
    searchByTitle(title, artist) {
      return http.get<SongSearch>('/songs', { title, artist })
    },
    searchByTags(tokens) {
      return http.get<UserSongList>(`${user}/songs`, { q: tokens.join(' ') })
    },
    getSong(songId) {
      return http.get<UserSong>(`${user}/songs/${songId}`)
    },
    addTag(songId, tag: TagWrite) {
      return http.put<UserTag>(`${user}/songs/${songId}/tags`, tag)
    },
    removeTag(songId, tag: TagWrite) {
      return http.delete(`${user}/songs/${songId}/tags`, tag)
    },
    community() {
      return http.get<CommunityFeed>(`${user}/community`)
    },
    showcase() {
      return http.get<Showcase>('/showcase')
    },
  }
}
