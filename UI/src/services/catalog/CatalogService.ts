import type { SongSearch, TagWrite, UserSong, UserSongList, UserTag } from '../../domain/types'

export type DataSourceKind = 'http' | 'mock'

export interface CatalogService {
  readonly kind: DataSourceKind
  searchByTitle(title: string, artist?: string): Promise<SongSearch>
  searchByTags(tokens: readonly string[]): Promise<UserSongList>
  getSong(songId: number): Promise<UserSong>
  addTag(songId: number, tag: TagWrite): Promise<UserTag>
  removeTag(songId: number, tag: TagWrite): Promise<void>
}
