import { EMPTY_LIBRARY, isLibrary, type Library } from '../../domain/library'
import type { LibraryService } from './LibraryService'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function createLocalLibrary(
  username: string,
  storage: KeyValueStorage | null = browserStorage(),
): LibraryService {
  const key = `songtagger:library:${username}`

  return {
    kind: 'local',
    load() {
      try {
        const raw = storage?.getItem(key)
        const parsed: unknown = raw ? JSON.parse(raw) : null
        return isLibrary(parsed) ? parsed : EMPTY_LIBRARY
      } catch {
        return EMPTY_LIBRARY
      }
    },
    save(library: Library) {
      try {
        storage?.setItem(key, JSON.stringify(library))
      } catch {
        return
      }
    },
  }
}
