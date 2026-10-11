import type { LibraryUser } from '../../domain/library'
import type { Recommendations } from '../../domain/types'
import type { HttpClient } from '../http/httpClient'
import type { RecommendationService } from './RecommendationService'

export function createHttpRecommendations(
  http: HttpClient,
  resolveUser: () => Promise<LibraryUser>,
): RecommendationService {
  return {
    kind: 'http',
    async recommend(limit) {
      const user = await resolveUser()
      return http.get<Recommendations>(`/user/${user.id}/recommendations`, {
        limit: String(limit),
      })
    },
  }
}
