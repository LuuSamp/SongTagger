import type { CatalogSong, Source } from './types'

const SOURCE_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube: 'YouTube',
  discogs: 'Discogs',
  musicbrainz: 'MusicBrainz',
}

const LISTENING_SOURCES = ['spotify', 'apple_music', 'youtube']

export function sourceLabel(source: Source): string {
  return SOURCE_LABELS[source.name] ?? source.name
}

export function listeningSources(sources: readonly Source[]): Source[] {
  return LISTENING_SOURCES.flatMap((name) => sources.filter((source) => source.name === name))
}

export function catalogSources(sources: readonly Source[]): Source[] {
  return sources.filter((source) => !LISTENING_SOURCES.includes(source.name))
}

export function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null || durationMs <= 0) {
    return null
  }
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function songPath(song: Pick<CatalogSong, 'id'>): string {
  return `/songs/${song.id}`
}

const SIMILARITY_KINDS = ['genre', 'feeling'] as const
const SIMILARITY_LIMIT = 4

export function similarityTokens(song: CatalogSong): string[] {
  const tokens = SIMILARITY_KINDS.flatMap((kind) =>
    song.tags.filter((tag) => tag.kind === kind).map((tag) => tag.token),
  ).slice(0, SIMILARITY_LIMIT)
  if (tokens.length > 0) {
    return tokens
  }
  return song.tags
    .filter((tag) => tag.kind === 'artist')
    .map((tag) => tag.token)
    .slice(0, 1)
}
