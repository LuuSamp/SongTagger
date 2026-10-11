import { useCallback } from 'react'
import { useCatalog } from '../app/contexts'
import type { CommunityFeed } from '../domain/types'
import { useAsync } from './useAsync'

export function useCommunity() {
  const catalog = useCatalog()
  const load = useCallback(() => catalog.community(), [catalog])
  return useAsync<CommunityFeed>(load)
}
