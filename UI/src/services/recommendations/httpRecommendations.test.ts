import { describe, expect, it } from 'vitest'
import type { HttpClient } from '../http/httpClient'
import { createHttpRecommendations } from './httpRecommendations'

describe('http recommendations', () => {
  it('asks the user-id route with the requested limit', async () => {
    const calls: Array<{ path: string; params?: Record<string, string | undefined> }> = []
    const http = {
      get: (path: string, params?: Record<string, string | undefined>) => {
        calls.push({ path, params })
        return Promise.resolve({ songs: [] })
      },
    } as unknown as HttpClient

    const service = createHttpRecommendations(http, () =>
      Promise.resolve({ id: 3, username: 'ada' }),
    )
    const result = await service.recommend(12)

    expect(result).toEqual({ songs: [] })
    expect(calls).toEqual([{ path: '/user/3/recommendations', params: { limit: '12' } }])
  })
})
