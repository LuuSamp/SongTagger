import { displayTagName, foldText, normalizeTagName, sortTags, toToken } from '../../domain/tags'
import type { CommunityFeed, Song, TagKind, TagWrite, UserSong, UserTag } from '../../domain/types'
import {
  MOCK_CATALOG_USER,
  type FixtureSong,
  type FixtureTagApplication,
} from '../../mocks/catalogFixtures'
import { ApiError } from '../http/httpClient'
import type { CatalogService } from './CatalogService'

interface MockCatalogOptions {
  username: string
  latencyMs?: number
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

function cloneFixtures(fixtures: readonly FixtureSong[]): FixtureSong[] {
  return fixtures.map((fixture) => ({
    ...fixture,
    sources: fixture.sources.map((source) => ({ ...source })),
    tags: fixture.tags.map((tag) => ({ ...tag })),
  }))
}

function uniqueTags(applications: readonly FixtureTagApplication[], username: string): UserTag[] {
  const byKey = new Map<string, UserTag>()
  for (const application of applications) {
    const key = `${application.kind}:${normalizeTagName(application.name)}`
    const existing = byKey.get(key)
    const mine = application.appliedBy === username
    if (existing) {
      existing.applied_by_me = existing.applied_by_me || mine
    } else {
      byKey.set(key, {
        kind: application.kind,
        name: application.name,
        token: toToken(application.name),
        applied_by_me: mine,
      })
    }
  }
  return sortTags([...byKey.values()])
}

function toUserSong(fixture: FixtureSong, username: string): UserSong {
  return { ...fixture, sources: [...fixture.sources], tags: uniqueTags(fixture.tags, username) }
}

function toSong(fixture: FixtureSong): Song {
  return {
    ...fixture,
    sources: [...fixture.sources],
    tags: uniqueTags(fixture.tags, '').map(({ kind, name, token }) => ({ kind, name, token })),
  }
}

function parseTagWrite(tag: TagWrite): { name: string; key: string } {
  const name = displayTagName(tag.token)
  const key = normalizeTagName(tag.token)
  if (!key) {
    throw new ApiError(400, 'token is empty')
  }
  return { name, key }
}

export function createMockCatalog(
  fixtures: readonly FixtureSong[],
  { username, latencyMs = 350 }: MockCatalogOptions,
): CatalogService {
  const songs = cloneFixtures(fixtures)

  function requireUser() {
    if (username === MOCK_CATALOG_USER) {
      throw new ApiError(400, 'catalog is reserved')
    }
  }

  function requireSong(songId: number): FixtureSong {
    const found = songs.find((candidate) => candidate.id === songId)
    if (!found) {
      throw new ApiError(404, 'song not found')
    }
    return found
  }

  return {
    kind: 'mock',
    async searchByTitle(title, artist) {
      await wait(latencyMs)
      const titleKey = foldText(title)
      if (!titleKey) {
        throw new ApiError(400, 'title is required')
      }
      const artistKey = artist ? foldText(artist) : ''
      const matches = songs.filter(
        (candidate) =>
          foldText(candidate.title) === titleKey &&
          (!artistKey || foldText(candidate.artist_credit).includes(artistKey)),
      )
      return { songs: matches.map(toSong), imported: false }
    },
    async searchByTags(tokens) {
      await wait(latencyMs)
      requireUser()
      const keys = [...new Set(tokens.map(normalizeTagName).filter(Boolean))]
      if (keys.length === 0) {
        throw new ApiError(400, 'q is required')
      }
      const matches = songs.filter((candidate) => {
        const names = new Set(candidate.tags.map((tag) => normalizeTagName(tag.name)))
        return keys.every((key) => names.has(key))
      })
      return { songs: matches.map((fixture) => toUserSong(fixture, username)) }
    },
    async getSong(songId) {
      await wait(latencyMs)
      requireUser()
      return toUserSong(requireSong(songId), username)
    },
    async addTag(songId, tag) {
      await wait(latencyMs)
      requireUser()
      const target = requireSong(songId)
      const { name, key } = parseTagWrite(tag)
      const existingName =
        songs
          .flatMap((candidate) => candidate.tags)
          .find((applied) => applied.kind === tag.kind && normalizeTagName(applied.name) === key)
          ?.name ?? name
      const alreadyMine = target.tags.some(
        (applied) =>
          applied.kind === tag.kind &&
          normalizeTagName(applied.name) === key &&
          applied.appliedBy === username,
      )
      if (!alreadyMine) {
        target.tags.push({ kind: tag.kind, name: existingName, appliedBy: username })
      }
      return {
        kind: tag.kind,
        name: existingName,
        token: toToken(existingName),
        applied_by_me: true,
      }
    },
    async removeTag(songId, tag) {
      await wait(latencyMs)
      requireUser()
      const target = requireSong(songId)
      const { key } = parseTagWrite(tag)
      target.tags = target.tags.filter(
        (applied) =>
          !(
            applied.kind === tag.kind &&
            normalizeTagName(applied.name) === key &&
            applied.appliedBy === username
          ),
      )
    },
    async community() {
      await wait(latencyMs)
      requireUser()
      return mockCommunity(songs, username)
    },
  }
}

const MOCK_TRENDING_LIMIT = 10
const MOCK_RISING_LIMIT = 8

function mockCommunity(songs: readonly FixtureSong[], username: string): CommunityFeed {
  const listeners = (fixture: FixtureSong) =>
    fixture.tags.filter((tag) => tag.appliedBy !== MOCK_CATALOG_USER)

  const perArtist = new Map<string, number>()
  const trending = [...songs]
    .map((fixture) => ({ fixture, signals: listeners(fixture) }))
    .filter(({ signals }) => signals.length > 0)
    .sort((a, b) => b.signals.length - a.signals.length || a.fixture.id - b.fixture.id)
    .filter(({ fixture }) => {
      const count = perArtist.get(fixture.artist_credit) ?? 0
      perArtist.set(fixture.artist_credit, count + 1)
      return count < 2
    })
    .slice(0, MOCK_TRENDING_LIMIT)
    .map(({ fixture, signals }) => {
      const people = new Set(signals.map((tag) => tag.appliedBy)).size
      const consensus = signals
        .filter((tag) => tag.kind !== 'artist')
        .slice(0, 3)
        .map((tag) => ({ kind: tag.kind, name: tag.name, token: toToken(tag.name), people: 1 }))
      return {
        song: toUserSong(fixture, username),
        score: signals.length,
        people,
        playlist_adds: 0,
        taggers: people,
        likes: 0,
        consensus,
      }
    })

  const tagCounts = new Map<string, { kind: TagKind; name: string; count: number }>()
  for (const fixture of songs) {
    for (const tag of listeners(fixture)) {
      const key = `${tag.kind}:${normalizeTagName(tag.name)}`
      const entry = tagCounts.get(key) ?? { kind: tag.kind, name: tag.name, count: 0 }
      entry.count += 1
      tagCounts.set(key, entry)
    }
  }
  const risingTags = [...tagCounts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MOCK_RISING_LIMIT)
    .map((entry) => ({
      tag: { kind: entry.kind, name: entry.name, token: toToken(entry.name) },
      recent: entry.count,
      baseline: 0,
      growth: 1,
      people: entry.count,
    }))

  return { trending_window: 'all_time', trending, tags_window: 'all_time', rising_tags: risingTags }
}
