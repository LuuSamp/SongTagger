import { featuredVibes, moreVibes, type VibePalette } from '../../config/vibes'
import type { CatalogSong } from '../../domain/types'

const VIBES = [...moreVibes, ...featuredVibes]

export function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function paletteForSong(song: Pick<CatalogSong, 'id' | 'tags' | 'title'>): VibePalette {
  const tokens = new Set(song.tags.map((tag) => tag.token))
  const matched = VIBES.find((vibe) => vibe.relatedTags.some((token) => tokens.has(token)))
  if (matched) {
    return matched.palette
  }
  const fallback = VIBES[hashSeed(`${song.id}:${song.title}`) % VIBES.length]
  return (fallback ?? VIBES[0]!).palette
}
