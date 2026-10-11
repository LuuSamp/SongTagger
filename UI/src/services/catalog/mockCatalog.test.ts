import { describe, expect, it } from 'vitest'
import { catalogFixtures } from '../../mocks/catalogFixtures'
import { ApiError } from '../http/httpClient'
import { createMockCatalog } from './mockCatalog'

function catalog() {
  return createMockCatalog(catalogFixtures, { username: 'ada', latencyMs: 0 })
}

describe('mock catalog', () => {
  it('matches every token when searching by tags', async () => {
    const result = await catalog().searchByTags(['mpb', 'sunny'])
    expect(result.songs.map((song) => song.title)).toEqual([
      'Águas de Março',
      'The Girl From Ipanema',
    ])
  })

  it('matches exact folded titles', async () => {
    const result = await catalog().searchByTitle('aguas de marco')
    expect(result.songs).toHaveLength(1)
    expect(result.imported).toBe(false)
  })

  it('adds a tag for the caller and removes only their application', async () => {
    const service = catalog()
    const added = await service.addTag(1, { kind: 'feeling', token: 'late-night' })
    expect(added).toEqual({
      kind: 'feeling',
      name: 'Late Night',
      token: 'late-night',
      applied_by_me: true,
    })

    const tagged = await service.getSong(1)
    expect(tagged.tags.find((tag) => tag.token === 'late-night')?.applied_by_me).toBe(true)

    await service.removeTag(1, { kind: 'feeling', token: 'warm' })
    const untouched = await service.getSong(1)
    expect(untouched.tags.some((tag) => tag.token === 'warm')).toBe(true)

    await service.removeTag(1, { kind: 'feeling', token: 'late-night' })
    const removed = await service.getSong(1)
    expect(removed.tags.some((tag) => tag.token === 'late-night')).toBe(false)
  })

  it('rejects unknown songs with a 404', async () => {
    await expect(catalog().getSong(999)).rejects.toMatchObject({ status: 404 })
    await expect(catalog().getSong(999)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('mock community feed', () => {
  it('ranks songs by listener activity and never counts catalog tags', async () => {
    const feed = await createMockCatalog(catalogFixtures, {
      username: 'ada',
      latencyMs: 0,
    }).community()
    expect(feed.trending_window).toBe('all_time')
    expect(feed.trending.length).toBeGreaterThan(0)
    expect(feed.trending.every((item) => item.people > 0)).toBe(true)
    const tokens = feed.rising_tags.map((entry) => entry.tag.token)
    expect(tokens).not.toContain('mpb')
    expect(feed.rising_tags.length).toBeLessThanOrEqual(8)
  })
})
