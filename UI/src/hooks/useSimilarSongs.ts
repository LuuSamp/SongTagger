import { useCallback, useEffect, useRef } from 'react'
import { useCatalog } from '../app/contexts'
import { similarityTokens } from '../domain/songs'
import { sharedTags } from '../domain/tags'
import type { CatalogSong } from '../domain/types'
import { useAsync } from './useAsync'

export function useSimilarSongs(song: CatalogSong, limit: number) {
  const catalog = useCatalog()
  const tokens = similarityTokens(song)
  const tokensKey = tokens.join(' ')
  const songId = song.id
  const songTagsRef = useRef(song.tags)

  useEffect(() => {
    songTagsRef.current = song.tags
  }, [song.tags])

  const load = useCallback(async (): Promise<CatalogSong[]> => {
    const results = await Promise.all(
      tokensKey.split(' ').map((token) => catalog.searchByTags([token])),
    )
    const unique = new Map<number, CatalogSong>()
    for (const candidate of results.flatMap((result) => result.songs)) {
      if (candidate.id !== songId) {
        unique.set(candidate.id, candidate)
      }
    }
    return [...unique.values()]
      .map((candidate) => ({
        candidate,
        score: sharedTags(candidate.tags, songTagsRef.current).length,
      }))
      .sort((a, b) => b.score - a.score || a.candidate.id - b.candidate.id)
      .slice(0, limit)
      .map(({ candidate }) => candidate)
  }, [catalog, limit, songId, tokensKey])

  return useAsync<CatalogSong[]>(tokensKey ? load : null)
}
