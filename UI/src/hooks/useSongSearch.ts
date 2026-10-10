import { useCallback } from 'react'
import { useCatalog } from '../app/contexts'
import type { CatalogSong } from '../domain/types'
import { useAsync } from './useAsync'

export type SongQuery =
  { mode: 'tags'; tokens: string[] } | { mode: 'title'; title: string; artist: string } | null

export interface SongSearchResult {
  songs: CatalogSong[]
  imported: boolean
}

export function useSongSearch(query: SongQuery) {
  const catalog = useCatalog()
  const key = query ? JSON.stringify(query) : null

  const load = useCallback(async (): Promise<SongSearchResult> => {
    const parsed = JSON.parse(key as string) as Exclude<SongQuery, null>
    if (parsed.mode === 'tags') {
      const result = await catalog.searchByTags(parsed.tokens)
      return { songs: result.songs, imported: false }
    }
    return catalog.searchByTitle(parsed.title, parsed.artist || undefined)
  }, [catalog, key])

  return useAsync<SongSearchResult>(key ? load : null)
}
