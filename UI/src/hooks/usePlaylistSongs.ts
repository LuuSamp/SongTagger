import { useCallback } from 'react'
import { useCatalog } from '../app/contexts'
import type { CatalogSong } from '../domain/types'
import { useAsync } from './useAsync'

export function usePlaylistSongs(songIds: readonly number[]) {
  const catalog = useCatalog()
  const idsKey = songIds.join(',')

  const load = useCallback(async (): Promise<CatalogSong[]> => {
    const ids = idsKey.split(',').map(Number)
    const results = await Promise.allSettled(ids.map((id) => catalog.getSong(id)))
    return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
  }, [catalog, idsKey])

  return useAsync<CatalogSong[]>(idsKey ? load : null)
}
