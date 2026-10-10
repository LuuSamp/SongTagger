import { describe, expect, it } from 'vitest'
import { EMPTY_LIBRARY } from '../../domain/library'
import { createLocalLibrary, type KeyValueStorage } from './localLibrary'

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

describe('local library storage', () => {
  it('round-trips the library per user', () => {
    const storage = memoryStorage()
    const library = {
      favorites: [{ id: 1, title: 'Sampa', artist_credit: 'Caetano Veloso', tags: [] }],
      playlists: [],
    }
    createLocalLibrary('ada', storage).save(library)
    expect(createLocalLibrary('ada', storage).load()).toEqual(library)
    expect(createLocalLibrary('bia', storage).load()).toEqual(EMPTY_LIBRARY)
  })

  it('falls back to an empty library on corrupt or missing data', () => {
    const storage = memoryStorage({ 'songtagger:library:ada': '{not json' })
    expect(createLocalLibrary('ada', storage).load()).toEqual(EMPTY_LIBRARY)
    expect(createLocalLibrary('ada', null).load()).toEqual(EMPTY_LIBRARY)
  })
})
