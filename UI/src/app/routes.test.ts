import { describe, expect, it } from 'vitest'
import { discoverPath, libraryPath, songQueryFromParams } from './routes'

describe('libraryPath', () => {
  it('keeps the default playlists tab bare', () => {
    expect(libraryPath()).toBe('/library')
    expect(libraryPath('playlists', 4)).toBe('/library?playlist=4')
  })

  it('writes a favorites search the same way discovery does', () => {
    expect(libraryPath('favorites', undefined, { tags: ['jazz', 'late-night'] })).toBe(
      '/library?tab=favorites&tags=jazz+late-night',
    )
    expect(libraryPath('favorites', undefined, { title: 'Sampa', artist: 'Caetano' })).toBe(
      '/library?tab=favorites&title=Sampa&artist=Caetano',
    )
    expect(discoverPath({ tags: ['jazz'] })).toBe('/discover?tags=jazz')
  })

  it('round-trips through the query parser', () => {
    const path = libraryPath('favorites', undefined, { tags: ['dream-pop'] })
    const params = new URLSearchParams(path.split('?')[1])
    expect(songQueryFromParams(params)).toEqual({ mode: 'tags', tokens: ['dream-pop'] })
  })
})
