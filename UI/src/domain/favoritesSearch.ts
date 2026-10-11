import type { SongQuery } from '../hooks/useSongSearch'
import { foldText, toToken } from './tags'
import type { CatalogSong } from './types'

export function filterSongs<T extends Pick<CatalogSong, 'title' | 'artist_credit' | 'tags'>>(
  songs: readonly T[],
  query: SongQuery,
): T[] {
  if (!query) {
    return [...songs]
  }
  if (query.mode === 'tags') {
    return songs.filter((song) => {
      const tokens = new Set(song.tags.map((tag) => toToken(tag.name)))
      return query.tokens.every((token) => tokens.has(toToken(token)))
    })
  }
  const title = foldText(query.title)
  const artist = foldText(query.artist)
  return songs.filter(
    (song) =>
      foldText(song.title).includes(title) &&
      (!artist || foldText(song.artist_credit).includes(artist)),
  )
}

export function topTags(songs: readonly Pick<CatalogSong, 'tags'>[], limit: number): string[] {
  const counts = new Map<string, { count: number; first: number }>()
  let order = 0
  for (const song of songs) {
    const seen = new Set<string>()
    for (const tag of song.tags) {
      if (tag.kind === 'artist') {
        continue
      }
      const token = toToken(tag.name)
      if (!token || seen.has(token)) {
        continue
      }
      seen.add(token)
      const entry = counts.get(token)
      if (entry) {
        entry.count += 1
      } else {
        counts.set(token, { count: 1, first: order })
        order += 1
      }
    }
  }
  return [...counts.entries()]
    .sort(([, a], [, b]) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map(([token]) => token)
}
