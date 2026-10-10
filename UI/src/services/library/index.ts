import type { AppConfig } from '../../config/session'
import { createHttpClient } from '../http/httpClient'
import { createHttpLibrary } from './httpLibrary'
import type { LibraryService } from './LibraryService'
import { createUnavailableLibrary } from './unavailableLibrary'

export function createLibraryService(config: AppConfig): LibraryService {
  if (config.dataSource === 'http') {
    return createHttpLibrary(
      createHttpClient(config.apiBaseUrl),
      config.username,
      config.apiBaseUrl,
    )
  }
  return createUnavailableLibrary()
}

export {
  FavoritesUnsupportedError,
  LibraryUnavailableError,
  SpotifyNotConnectedError,
} from './LibraryService'
export type { LibraryService, LibrarySourceKind } from './LibraryService'
