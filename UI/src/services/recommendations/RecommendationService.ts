import type { Recommendations } from '../../domain/types'

export type RecommendationSourceKind = 'http' | 'unavailable'

export interface RecommendationService {
  readonly kind: RecommendationSourceKind
  recommend(limit: number): Promise<Recommendations>
}

export class RecommendationsUnavailableError extends Error {
  constructor() {
    super('Recommendations need the SongTagger API. Run the UI with VITE_DATA_SOURCE=http.')
    this.name = 'RecommendationsUnavailableError'
  }
}
