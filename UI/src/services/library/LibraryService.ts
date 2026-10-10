import type { Library } from '../../domain/library'

export type LibrarySourceKind = 'local'

export interface LibraryService {
  readonly kind: LibrarySourceKind
  load(): Library
  save(library: Library): void
}
