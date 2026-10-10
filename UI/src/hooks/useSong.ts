import { useCallback } from 'react'
import { useCatalog } from '../app/contexts'
import type { UserSong } from '../domain/types'
import { useAsync } from './useAsync'

export function useSong(songId: number | null) {
  const catalog = useCatalog()
  const load = useCallback(
    () =>
      songId === null ? Promise.reject(new Error('Invalid song id')) : catalog.getSong(songId),
    [catalog, songId],
  )
  return useAsync<UserSong>(load)
}
