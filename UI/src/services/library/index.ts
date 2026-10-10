import type { AppConfig } from '../../config/session'
import type { LibraryService } from './LibraryService'
import { createLocalLibrary } from './localLibrary'

export function createLibraryService(config: AppConfig): LibraryService {
  return createLocalLibrary(config.username)
}

export type { LibraryService, LibrarySourceKind } from './LibraryService'
