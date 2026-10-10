import { parseTokens } from '../domain/tags'
import type { SongQuery } from '../hooks/useSongSearch'

export const APP_PATHS = {
  landing: '/',
  discover: '/discover',
  community: '/community',
  library: '/library',
} as const

export type DiscoverQuery = { tags: string[] } | { title: string; artist?: string }

export function discoverPath(query?: DiscoverQuery): string {
  if (!query) {
    return APP_PATHS.discover
  }
  const params = new URLSearchParams()
  if ('tags' in query) {
    params.set('tags', query.tags.join(' '))
  } else {
    params.set('title', query.title)
    if (query.artist) {
      params.set('artist', query.artist)
    }
  }
  return `${APP_PATHS.discover}?${params.toString()}`
}

export function songQueryFromParams(params: URLSearchParams): SongQuery {
  const title = params.get('title')?.trim()
  if (title) {
    return { mode: 'title', title, artist: params.get('artist')?.trim() ?? '' }
  }
  const tokens = parseTokens(params.get('tags') ?? '')
  return tokens.length > 0 ? { mode: 'tags', tokens } : null
}

export function parseSongId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null
  }
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export type LibraryTab = 'favorites' | 'playlists'

export function libraryPath(tab: LibraryTab = 'playlists', playlistId?: number): string {
  const params = new URLSearchParams()
  if (tab !== 'playlists') {
    params.set('tab', tab)
  }
  if (playlistId !== undefined) {
    params.set('playlist', String(playlistId))
  }
  const query = params.toString()
  return query ? `${APP_PATHS.library}?${query}` : APP_PATHS.library
}
