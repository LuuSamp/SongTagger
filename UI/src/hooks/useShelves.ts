import { useCallback } from 'react'
import { useCatalog } from '../app/contexts'
import type { CatalogSong } from '../domain/types'
import { useAsync } from './useAsync'

export interface ShelfRequest {
  id: string
  token: string
}

export interface Shelf extends ShelfRequest {
  songs: CatalogSong[]
}

export function useShelves(
  requests: readonly ShelfRequest[],
  excludeIds: readonly number[],
  perShelf: number,
) {
  const catalog = useCatalog()
  const requestKey = JSON.stringify(requests)
  const excludeKey = [...excludeIds].sort((a, b) => a - b).join(',')

  const load = useCallback(async (): Promise<Shelf[]> => {
    const parsed = JSON.parse(requestKey) as ShelfRequest[]
    const excluded = new Set(excludeKey ? excludeKey.split(',').map(Number) : [])
    const results = await Promise.all(
      parsed.map((request) => catalog.searchByTags([request.token])),
    )
    return parsed.map((request, index) => ({
      ...request,
      songs: (results[index]?.songs ?? [])
        .filter((song) => !excluded.has(song.id))
        .slice(0, perShelf),
    }))
  }, [catalog, excludeKey, perShelf, requestKey])

  return useAsync<Shelf[]>(requests.length > 0 ? load : null)
}
