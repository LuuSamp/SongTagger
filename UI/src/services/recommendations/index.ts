import type { AppConfig } from '../../config/session'
import { createHttpClient } from '../http/httpClient'
import type { LibraryService } from '../library'
import { createHttpRecommendations } from './httpRecommendations'
import {
  RecommendationsUnavailableError,
  type RecommendationService,
} from './RecommendationService'

export function createRecommendationService(
  config: AppConfig,
  library: LibraryService,
): RecommendationService {
  if (config.dataSource === 'http' && library.kind === 'http') {
    return createHttpRecommendations(createHttpClient(config.apiBaseUrl), () =>
      library.resolveUser(),
    )
  }
  return {
    kind: 'unavailable',
    recommend: () => Promise.reject(new RecommendationsUnavailableError()),
  }
}

export { RecommendationsUnavailableError } from './RecommendationService'
export type { RecommendationService, RecommendationSourceKind } from './RecommendationService'
