export const TAG_KINDS = ['artist', 'genre', 'feeling', 'instrument'] as const

export type TagKind = (typeof TAG_KINDS)[number]

export type SourceName = 'musicbrainz' | 'spotify' | 'apple_music' | 'youtube' | 'discogs'

export interface Source {
  name: SourceName | string
  external_id: string
  url: string
}

export interface Tag {
  kind: TagKind
  name: string
  token: string
}

export interface UserTag extends Tag {
  applied_by_me: boolean
}

interface SongFields {
  id: number
  title: string
  artist_credit: string
  duration_ms: number | null
  mbid: string | null
  isrc: string | null
  disambiguation: string | null
  image_url: string | null
  sources: Source[]
}

export interface Song extends SongFields {
  tags: Tag[]
}

export interface UserSong extends SongFields {
  tags: UserTag[]
}

export interface SongSearch {
  songs: Song[]
  imported: boolean
}

export interface UserSongList {
  songs: UserSong[]
}

export interface TagWrite {
  kind: TagKind
  token: string
}

export type CatalogSong = Song | UserSong
