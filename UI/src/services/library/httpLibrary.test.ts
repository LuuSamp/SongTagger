import { describe, expect, it } from 'vitest'
import { ApiError, type HttpClient } from '../http/httpClient'
import { createHttpLibrary } from './httpLibrary'
import { FavoritesUnsupportedError } from './LibraryService'

interface Call {
  method: string
  path: string
  body?: unknown
}

function fakeHttp(responses: Record<string, unknown>) {
  const calls: Call[] = []
  const respond = <T>(method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body })
    return Promise.resolve(responses[`${method} ${path}`] as T)
  }
  const http: HttpClient = {
    get: (path) => respond('GET', path),
    post: (path, body) => respond('POST', path, body),
    put: (path, body) => respond('PUT', path, body),
    patch: (path, body) => respond('PATCH', path, body),
    delete: async (path, body) => {
      calls.push({ method: 'DELETE', path, body })
    },
  }
  return { http, calls }
}

describe('http library', () => {
  it('resolves the numeric user id once and uses it for playlist routes', async () => {
    const { http, calls } = fakeHttp({
      'GET /users/ada': { id: 3, username: 'ada' },
      'GET /user/3/playlist': { playlists: [] },
      'POST /user/3/playlist': { id: 9, name: 'Noite', created_at: '', songs: [] },
    })
    const library = createHttpLibrary(http, 'ada')

    await library.listPlaylists()
    await library.createPlaylist('Noite')

    expect(calls.filter((call) => call.path === '/users/ada')).toHaveLength(1)
    expect(calls.at(-1)).toEqual({
      method: 'POST',
      path: '/user/3/playlist',
      body: { name: 'Noite' },
    })
  })

  it('maps song and order operations to the playlist endpoints', async () => {
    const { http, calls } = fakeHttp({ 'GET /users/ada': { id: 3, username: 'ada' } })
    const library = createHttpLibrary(http, 'ada')

    await library.addSong(9, 42)
    await library.removeSong(9, 77)
    await library.reorder(9, [2, 1])
    await library.renamePlaylist(9, 'Madrugada')
    await library.deletePlaylist(9)

    expect(calls.slice(1)).toEqual([
      { method: 'POST', path: '/user/3/playlist/9/song', body: { song_id: 42 } },
      { method: 'DELETE', path: '/user/3/playlist/9/song/77', body: undefined },
      { method: 'PUT', path: '/user/3/playlist/9/order', body: { membership_ids: [2, 1] } },
      { method: 'PATCH', path: '/user/3/playlist/9', body: { name: 'Madrugada' } },
      { method: 'DELETE', path: '/user/3/playlist/9', body: undefined },
    ])
  })

  it('retries the user lookup after a failure', async () => {
    let attempts = 0
    const { http } = fakeHttp({})
    http.get = <T>(path: string) => {
      attempts += 1
      return attempts === 1
        ? Promise.reject(new Error('down'))
        : Promise.resolve({ id: 3, username: 'ada', path } as T)
    }
    const library = createHttpLibrary(http, 'ada')

    await expect(library.resolveUser()).rejects.toThrow('down')
    await expect(library.resolveUser()).resolves.toMatchObject({ id: 3 })
  })

  it('maps favorites to the agreed contract', async () => {
    const { http, calls } = fakeHttp({
      'GET /users/ada': { id: 3, username: 'ada' },
      'GET /user/3/favorite': { songs: [] },
      'PUT /user/3/favorite/42': {
        song_id: 42,
        title: 'Sampa',
        artist_credit: 'Caetano Veloso',
        favorited_at: '',
      },
    })
    const library = createHttpLibrary(http, 'ada')

    await library.listFavorites()
    await library.addFavorite(42)
    await library.removeFavorite(42)

    expect(calls.slice(1)).toEqual([
      { method: 'GET', path: '/user/3/favorite', body: undefined },
      { method: 'PUT', path: '/user/3/favorite/42', body: {} },
      { method: 'DELETE', path: '/user/3/favorite/42', body: undefined },
    ])
  })

  it('treats a missing favorites route as unsupported but keeps real 404s', async () => {
    const { http } = fakeHttp({ 'GET /users/ada': { id: 3, username: 'ada' } })
    const library = createHttpLibrary(http, 'ada')
    const original = http.get
    http.get = <T>(path: string) =>
      path === '/user/3/favorite'
        ? Promise.reject(new ApiError(404, 'Not Found'))
        : original<T>(path)
    await expect(library.listFavorites()).rejects.toBeInstanceOf(FavoritesUnsupportedError)

    http.put = () => Promise.reject(new ApiError(404, 'unknown song'))
    await expect(library.addFavorite(999)).rejects.toMatchObject({
      status: 404,
      message: 'unknown song',
    })
  })
})
