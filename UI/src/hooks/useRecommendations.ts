import { useCallback, useEffect, useRef } from 'react'
import { useRecommendationService } from '../app/contexts'
import type { Recommendations } from '../domain/types'
import { useAsync } from './useAsync'

export function useRecommendations(limit: number, refreshKey: string, enabled: boolean) {
  const service = useRecommendationService()
  const active = enabled && service.kind === 'http'
  const load = useCallback(() => service.recommend(limit), [service, limit])
  const resource = useAsync<Recommendations>(active ? load : null)
  const { reload } = resource
  const seen = useRef({ key: refreshKey, active })

  useEffect(() => {
    const previous = seen.current
    seen.current = { key: refreshKey, active }
    if (active && previous.active && previous.key !== refreshKey) {
      reload()
    }
  }, [active, refreshKey, reload])

  return resource
}
