// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CatalogContext,
  LibraryContext,
  RecommendationsContext,
  SessionContext,
  type LibraryActions,
} from '../app/contexts'
import { router } from '../app/router'
import type { FavoriteSong, Playlist } from '../domain/library'
import type { CatalogService } from '../services/catalog'
import type { RecommendationService } from '../services/recommendations'
import type { TagWrite, UserSong, UserTag } from '../domain/types'
import { TagPage } from './TagPage'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const favoriteSong = song(1, 'Favorite Tune', [
  tag('feeling', 'Warm'),
  tag('instrument', 'Piano'),
  tag('genre', 'Jazz'),
])
const playlistSong = song(2, 'Playlist Tune', [tag('feeling', 'Bright')])

let root: Root | null = null

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(1 - Number.EPSILON)
})

afterEach(() => {
  vi.restoreAllMocks()
  act(() => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('Tag these songs', () => {
  it('registers /tag', () => {
    const paths = router.routes.flatMap((route) => route.children?.map((child) => child.path) ?? [])

    expect(paths).toContain('/tag')
  })

  it('shows a favorite before a song that is only on a playlist', async () => {
    const view = await renderQueue()

    expect(text(view)).toContain('Favorite Tune')
    expect(text(view)).not.toContain('Playlist Tune')
  })

  it('selecting a chip marks it as added and does not attach yet', async () => {
    const addTag = savedTag()
    const view = await renderQueue({ addTag })

    await click(view, 'Warm')

    expect(addTag).not.toHaveBeenCalled()
    expect(pressed(view, 'Warm')).toBe('true')
    expect(chipClass(view, 'Warm')).toMatch(/mine/)
    expect(buttons(view)).toContain('Warm')
    expect(text(view)).toContain('Favorite Tune')
    expect(text(view)).not.toContain('Playlist Tune')
  })

  it('clicking a selected chip deselects it', async () => {
    const addTag = savedTag()
    const view = await renderQueue({ addTag })

    await click(view, 'Warm')
    await click(view, 'Warm')

    expect(addTag).not.toHaveBeenCalled()
    expect(pressed(view, 'Warm')).toBe('false')
    expect(chipClass(view, 'Warm')).not.toMatch(/mine/)
    expect(buttons(view)).toContain('Warm')
  })

  it('go to next attaches the selected chips and shows the following song', async () => {
    const addTag = savedTag()
    const view = await renderQueue({ addTag })

    await click(view, 'Warm')
    await click(view, 'Piano')
    expect(addTag).not.toHaveBeenCalled()
    await click(view, 'Go to next')

    expect(addTag).toHaveBeenCalledTimes(2)
    expect(addTag).toHaveBeenCalledWith(1, { kind: 'feeling', token: 'warm' })
    expect(addTag).toHaveBeenCalledWith(1, { kind: 'instrument', token: 'piano' })
    expect(text(view)).toContain('Playlist Tune')
    expect(text(view)).not.toContain('Favorite Tune')
  })

  it('go to next does not attach a chip that was deselected', async () => {
    const addTag = savedTag()
    const view = await renderQueue({ addTag })

    await click(view, 'Warm')
    await click(view, 'Warm')
    await click(view, 'Go to next')

    expect(addTag).not.toHaveBeenCalled()
    expect(text(view)).toContain('Playlist Tune')
  })

  it('go to next does not call attach and shows the following song', async () => {
    const addTag = vi.fn()
    const view = await renderQueue({ addTag })

    await click(view, 'Go to next')

    expect(addTag).not.toHaveBeenCalled()
    expect(text(view)).toContain('Playlist Tune')
    expect(text(view)).not.toContain('Favorite Tune')
  })

  it('does not show a song again after go to next in that visit', async () => {
    const view = await renderQueue()

    await click(view, 'Go to next')
    expect(text(view)).not.toContain('Favorite Tune')

    await click(view, 'Go to next')
    expect(text(view)).not.toContain('Favorite Tune')
    expect(text(view)).not.toContain('Playlist Tune')
  })

  it('waits to show a song that has no feeling or instrument chip left', async () => {
    const heard = song(4, 'Heard It', [tag('feeling', 'Warm', true), tag('genre', 'Jazz')])
    const open = song(5, 'Still Open', [tag('instrument', 'Cello')])
    const view = await renderQueue({
      favorites: [favorite(4, 'Heard It')],
      playlists: [playlist([track(5, 'Still Open'), track(4, 'Heard It')])],
      songs: [heard, open],
    })

    expect(text(view)).toContain('Still Open')
    expect(text(view)).not.toContain('Heard It')
    expect(buttons(view)).not.toContain('Jazz')
  })

  it('uses the page title as the only heading and keeps kind dots on the chips', async () => {
    const view = await renderQueue()

    expect(view.querySelector('h1')?.textContent).toBe('Tag these songs')
    expect(view.querySelector('h2, h3')).toBeNull()
    expect(text(view)).not.toContain('What do you hear?')
    expect(view.innerHTML).toContain('var(--tag-feeling)')
    expect(view.innerHTML).toContain('var(--tag-instrument)')
    expect(buttons(view)).toContain('Add tag')
    expect(buttons(view)).toContain('Go to next')
    expect(buttons(view)).not.toContain('Jazz')
  })

  it('shows where the user is in the queue and advances it', async () => {
    const view = await renderQueue()

    expect(text(view)).toContain('Song 1 of 2')
    await click(view, 'Go to next')
    expect(text(view)).toContain('Song 2 of 2')
  })

  it('groups the suggested chips by kind with a label', async () => {
    const view = await renderQueue()
    const lists = [...view.querySelectorAll('ul[aria-label]')].map((list) => ({
      label: list.getAttribute('aria-label'),
      chips: [...list.querySelectorAll('button')].map((button) => button.textContent?.trim()),
    }))

    expect(lists).toEqual([
      { label: 'Feeling tags', chips: ['Warm'] },
      { label: 'Instrument tags', chips: ['Piano'] },
    ])
  })

  it('explains what go to next will do with the current selection', async () => {
    const view = await renderQueue()
    const summary = () => view.querySelector('[aria-live="polite"]')?.textContent

    expect(summary()).toBe('Nothing selected. Go to next skips this song.')
    await click(view, 'Warm')
    expect(summary()).toBe('1 tag will be saved when you go to next.')
    await click(view, 'Piano')
    expect(summary()).toBe('2 tags will be saved when you go to next.')
  })

  it('says when a song has no suggestions yet', async () => {
    const bare = song(9, 'Bare Tune', [tag('genre', 'Jazz')])
    const view = await renderQueue({
      favorites: [favorite(9, 'Bare Tune')],
      playlists: [],
      songs: [bare],
    })

    expect(text(view)).toContain('No suggestions yet. Add your own below.')
    expect(buttons(view)).toContain('Add tag')
    expect(buttons(view)).toContain('Go to next')
  })

  it('stages a custom tag above add tag and saves it on go to next', async () => {
    const addTag = savedTag()
    const view = await renderQueue({ addTag })

    await click(view, 'Add tag')
    await typeTag(view, 'Late night')
    await click(view, 'Add')

    expect(addTag).not.toHaveBeenCalled()
    expect(text(view)).toContain('They save when you go to next.')
    expect(pressed(view, 'Late night')).toBe('true')
    expect(chipClass(view, 'Late night')).toMatch(/mine/)
    expect(chipButton(view, 'Late night').parentElement?.getAttribute('style')).toContain(
      '--tag-feeling',
    )
    expect(chipPrecedes(view, 'Late night', 'form')).toBe(true)
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe(
      '1 tag will be saved when you go to next.',
    )

    await click(view, 'Late night')
    expect(pressed(view, 'Late night')).toBe('false')
    expect(chipButton(view, 'Late night')).toBeInstanceOf(HTMLButtonElement)

    await click(view, 'Late night')
    expect(pressed(view, 'Late night')).toBe('true')

    await click(view, 'Go to next')
    expect(addTag).toHaveBeenCalledTimes(1)
    expect(addTag).toHaveBeenCalledWith(1, { kind: 'feeling', token: 'late-night' })
    expect(text(view)).toContain('Playlist Tune')
    expect(text(view)).not.toContain('Late night')
  })

  it('selects an existing suggestion instead of adding a second chip', async () => {
    const addTag = savedTag()
    const view = await renderQueue({ addTag })

    await click(view, 'Add tag')
    await typeTag(view, 'Warm')
    await click(view, 'Add')

    expect(addTag).not.toHaveBeenCalled()
    expect(pressed(view, 'Warm')).toBe('true')
    expect(buttons(view).filter((name) => name === 'Warm')).toHaveLength(1)
  })

  it('asks for a tag when the name has no token', async () => {
    const view = await renderQueue()

    await click(view, 'Add tag')
    await typeTag(view, '---')
    await click(view, 'Add')

    expect(view.querySelector('#add-tag-error')?.textContent).toBe('Type a tag before adding it.')
    expect(view.querySelector('form')).not.toBeNull()
  })

  it('puts a newly liked song right after the current one', async () => {
    const liked = song(3, 'New Like', [tag('feeling', 'Sunny')])
    const songs = [favoriteSong, playlistSong, liked]
    const view = await renderQueue({ songs })
    expect(text(view)).toContain('Song 1 of 2')

    await rerender({ songs, favorites: [favorite(3, 'New Like'), favorite(1, 'Favorite Tune')] })

    expect(text(view)).toContain('Favorite Tune')
    expect(text(view)).toContain('Song 1 of 3')
    await click(view, 'Go to next')
    expect(text(view)).toContain('New Like')
    expect(text(view)).toContain('Song 2 of 3')
  })

  it('drops a waiting song that left the library', async () => {
    const view = await renderQueue()

    await rerender({ playlists: [] })

    expect(text(view)).toContain('Favorite Tune')
    expect(text(view)).toContain('Song 1 of 1')
    await click(view, 'Go to next')
    expect(text(view)).not.toContain('Playlist Tune')
  })

  it('reloads the library when the window regains focus', async () => {
    await renderQueue()

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(reloadFavoritesSpy).toHaveBeenCalledTimes(1)
  })

  it('places an unsaved recommendation between saved songs', async () => {
    const unsaved = song(8, 'Unsaved Tune', [tag('feeling', 'Hazy')])
    const view = await renderQueue({
      recommendations: [unsaved],
      songs: [favoriteSong, playlistSong, unsaved],
    })

    expect(text(view)).toContain('Favorite Tune')
    await click(view, 'Go to next')
    expect(text(view)).toContain('Unsaved Tune')
    expect(text(view)).not.toContain('Favorite Tune')
    await click(view, 'Go to next')
    expect(text(view)).toContain('Playlist Tune')
    expect(text(view)).not.toContain('Unsaved Tune')
  })

  it('plays recommendations when nothing is saved', async () => {
    const unsaved = song(8, 'Unsaved Tune', [tag('feeling', 'Hazy')])
    const view = await renderQueue({
      favorites: [],
      playlists: [],
      songs: [unsaved],
      recommendations: [unsaved],
    })

    expect(text(view)).toContain('Unsaved Tune')
    expect(text(view)).not.toContain('Nothing to tag right now')
  })

  it('shows one short line when the queue is empty', async () => {
    const view = await renderQueue({ favorites: [], playlists: [], songs: [] })
    const message = view.querySelector('[role="status"]')

    expect(message?.textContent).toBe('Nothing to tag right now')
    expect(buttons(view)).not.toContain('Go to next')
  })

  it('does not treat a loading library as an empty queue', () => {
    const view = renderNow({
      favoritesStatus: 'loading',
      status: 'loading',
      favorites: [],
      playlists: [],
      songs: [],
    })

    expect(text(view)).not.toContain('Nothing to tag right now')
  })
})

function savedTag(): CatalogService['addTag'] {
  return vi.fn(async (_songId: number, written: TagWrite) => ({
    kind: written.kind,
    token: written.token,
    name: written.token,
    applied_by_me: true,
  }))
}

function song(id: number, title: string, tags: UserTag[]): UserSong {
  return {
    id,
    title,
    artist_credit: 'Ada Lovelace',
    duration_ms: 180000,
    mbid: null,
    isrc: null,
    disambiguation: null,
    image_url: null,
    sources: [],
    tags,
  }
}

function tag(kind: UserTag['kind'], name: string, applied = false): UserTag {
  return {
    kind,
    name,
    token: name.toLowerCase().replace(/ /g, '-'),
    applied_by_me: applied,
  }
}

function favorite(songId: number, title: string): FavoriteSong {
  return {
    song_id: songId,
    title,
    artist_credit: 'Ada Lovelace',
    favorited_at: '2026-10-10T12:00:00',
  }
}

function track(songId: number, title: string, position = 1) {
  return {
    membership_id: songId,
    position,
    song_id: songId,
    title,
    artist_credit: 'Ada Lovelace',
    image_url: null,
  }
}

function playlist(songs: Playlist['songs']): Playlist {
  return {
    id: 7,
    name: 'Night',
    created_at: '2026-10-10T12:00:00',
    image_url: null,
    songs,
  }
}

interface QueueOptions {
  favorites?: FavoriteSong[]
  playlists?: Playlist[]
  songs?: UserSong[]
  recommendations?: UserSong[]
  addTag?: CatalogService['addTag']
  favoritesStatus?: LibraryActions['favoritesStatus']
  status?: LibraryActions['status']
}

function queueOptions(options: QueueOptions = {}): Required<QueueOptions> {
  return {
    favorites: options.favorites ?? [favorite(1, 'Favorite Tune')],
    playlists: options.playlists ?? [
      playlist([track(2, 'Playlist Tune', 1), track(1, 'Favorite Tune', 2)]),
    ],
    songs: options.songs ?? [favoriteSong, playlistSong],
    recommendations: options.recommendations ?? [],
    addTag:
      options.addTag ??
      (async (_songId: number, written: TagWrite) => ({
        kind: written.kind,
        token: written.token,
        name: written.token,
        applied_by_me: true,
      })),
    favoritesStatus: options.favoritesStatus ?? 'ready',
    status: options.status ?? 'ready',
  }
}

let reloadSpy = vi.fn()
let reloadFavoritesSpy = vi.fn()
let catalogSongs = new Map<number, UserSong>()
let catalog: CatalogService | null = null
let recommendationSongs: UserSong[] = []
let recommendations: RecommendationService | null = null

function tree(options: QueueOptions = {}) {
  const resolved = queueOptions(options)
  catalogSongs = new Map(resolved.songs.map((entry) => [entry.id, entry]))
  recommendationSongs = resolved.recommendations
  catalog ??= {
    kind: 'http',
    getSong: (songId: number) => {
      const found = catalogSongs.get(songId)
      return found ? Promise.resolve(found) : Promise.reject(new Error(`missing ${songId}`))
    },
    addTag: resolved.addTag,
  } as CatalogService
  recommendations ??= {
    kind: 'http',
    recommend: () =>
      Promise.resolve({
        songs: recommendationSongs.map((entry) => ({
          song: entry,
          score: 1,
          because: [],
        })),
      }),
  } as RecommendationService
  const library = {
    kind: 'http',
    status: resolved.status,
    favoritesStatus: resolved.favoritesStatus,
    favorites: resolved.favorites,
    playlists: resolved.playlists,
    loadError: null,
    favoritesError: null,
    reload: reloadSpy,
    reloadFavorites: reloadFavoritesSpy,
  } as unknown as LibraryActions
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionContext.Provider value={{ username: 'ada' }}>
        <CatalogContext.Provider value={catalog}>
            <RecommendationsContext.Provider value={recommendations}>
            <LibraryContext.Provider value={library}>
              <TagPage />
            </LibraryContext.Provider>
            </RecommendationsContext.Provider>
        </CatalogContext.Provider>
      </SessionContext.Provider>
    </MemoryRouter>
  )
}

function renderNow(options: QueueOptions = {}): HTMLElement {
  reloadSpy = vi.fn()
  reloadFavoritesSpy = vi.fn()
  catalog = null
  recommendations = null
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(tree(options))
  })
  return container
}

async function rerender(options: QueueOptions) {
  await act(async () => {
    root?.render(tree(options))
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renderQueue(options: QueueOptions = {}): Promise<HTMLElement> {
  const view = renderNow(options)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return view
}

function text(view: HTMLElement): string {
  return view.textContent ?? ''
}

function buttons(view: HTMLElement): string[] {
  return [...view.querySelectorAll('button')].map((button) => button.textContent?.trim() ?? '')
}

function chipButton(view: HTMLElement, name: string): HTMLButtonElement {
  const button = [...view.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === name,
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`No chip named ${name}`)
  }
  return button
}

function pressed(view: HTMLElement, name: string): string | null {
  return chipButton(view, name).getAttribute('aria-pressed')
}

function chipClass(view: HTMLElement, name: string): string {
  return chipButton(view, name).parentElement?.className ?? ''
}

function chipPrecedes(view: HTMLElement, name: string, selector: string): boolean {
  const chip = chipButton(view, name)
  const later = chip.closest('li')?.parentElement?.parentElement?.querySelector(selector)
  if (!later) {
    return false
  }
  return Boolean(chip.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING)
}

async function typeTag(view: HTMLElement, name: string) {
  const input = view.querySelector('#add-tag-name')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('No tag name field')
  }
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, name)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function click(view: HTMLElement, name: string) {
  const button = [...view.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === name,
  )
  if (!button) {
    throw new Error(`No button named ${name}. Saw: ${buttons(view).join(', ')}`)
  }
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
}
