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

export type CommunityWindow = 'week' | 'all_time'

export interface ConsensusTag extends Tag {
  people: number
}

export interface TrendingSong {
  song: UserSong
  score: number
  people: number
  playlist_adds: number
  taggers: number
  likes: number
  consensus: ConsensusTag[]
}

export interface RisingTag {
  tag: Tag
  recent: number
  baseline: number
  growth: number
  people: number
}

export interface CommunityFeed {
  trending_window: CommunityWindow
  trending: TrendingSong[]
  tags_window: CommunityWindow
  rising_tags: RisingTag[]
}

export interface RecommendedSong {
  song: UserSong
  score: number
  because: Tag[]
}

export interface Recommendations {
  songs: RecommendedSong[]
}
