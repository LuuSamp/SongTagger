import { useCallback } from 'react'
import { useCatalog } from '../app/contexts'
import { fallbackShowcase } from '../config/showcase'
import type { Showcase, ShowcaseSong } from '../domain/types'
import { useAsync } from './useAsync'

export interface ShowcaseState {
  songs: readonly ShowcaseSong[]
  /** False for the static fallback: its tags may not exist in the catalog, so they are not links. */
  linked: boolean
}

export function useShowcase(): ShowcaseState {
  const catalog = useCatalog()
  const load = useCallback(() => catalog.showcase(), [catalog])
  const { state } = useAsync<Showcase>(load)

  if (state.status === 'success' && state.data.songs.length > 0) {
    return { songs: state.data.songs, linked: true }
  }
  if (state.status === 'success' || state.status === 'error') {
    return { songs: fallbackShowcase, linked: false }
  }
  return { songs: [], linked: true }
}
