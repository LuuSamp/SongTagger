import { describe, expect, it } from 'vitest'
import { orderTagSongs, type RandomSource } from './tagQueue'
import type { UserSong, UserTag } from './types'

const keepOrder: RandomSource = () => 1 - Number.EPSILON

describe('orderTagSongs', () => {
  it('places each unknown between known songs, with known songs on both ends', () => {
    const mixed = orderTagSongs(
      [song(1, 'One'), song(2, 'Two'), song(3, 'Three')],
      [song(4, 'Four'), song(5, 'Five'), song(6, 'Six')],
      keepOrder,
    )

    expect(ids(mixed)).toEqual([1, 4, 2, 5, 3])
    expect(knownOnBothEnds(mixed, new Set([1, 2, 3]))).toBe(true)
    expect(adjacentUnknowns(mixed, new Set([4, 5, 6]))).toBe(false)
  })

  it('may follow a single known song with one unknown', () => {
    const mixed = orderTagSongs([song(1, 'One')], [song(2, 'Two'), song(3, 'Three')], keepOrder)

    expect(ids(mixed)).toEqual([1, 2])
  })

  it('returns the shuffled recommendations when nothing is saved', () => {
    const mixed = orderTagSongs([], [song(1, 'One'), song(2, 'Two'), song(3, 'Three')], () => 0)

    expect(ids(mixed)).toEqual([2, 3, 1])
  })

  it('does not insert a recommendation that is already a favorite or playlist song', () => {
    const mixed = orderTagSongs(
      [song(1, 'Saved'), song(2, 'Also saved')],
      [song(2, 'Also saved'), song(2, 'Also saved'), song(9, 'New')],
      keepOrder,
    )

    expect(ids(mixed)).toEqual([1, 9, 2])
  })

  it('shuffles the known pool with the random source', () => {
    const mixed = orderTagSongs([song(1, 'Favorite'), song(2, 'Playlist')], [], () => 0)

    expect(ids(mixed)).toEqual([2, 1])
  })

  it('keeps one unknown inside a spare gap, with known songs on both ends', () => {
    const mixed = orderTagSongs(
      [song(1, 'One'), song(2, 'Two'), song(3, 'Three'), song(4, 'Four')],
      [song(9, 'Nine')],
      () => 0,
    )
    const order = ids(mixed)
    const at = order.indexOf(9)

    expect(order[0]).not.toBe(9)
    expect(order[order.length - 1]).not.toBe(9)
    expect(at).toBeGreaterThan(0)
    expect(order[at + 1]).not.toBe(9)
    expect(new Set(order).size).toBe(order.length)
  })

  it('shuffles songs that still have a chip ahead of songs that do not', () => {
    const heard = song(4, 'Heard', [chip('feeling', 'Warm', true)])
    const first = song(5, 'First', [chip('instrument', 'Cello')])
    const second = song(6, 'Second', [chip('feeling', 'Bright')])

    expect(ids(orderTagSongs([heard, first, second], [], () => 0))).toEqual([6, 5, 4])
  })
})

function ids(songs: readonly UserSong[]): number[] {
  return songs.map((entry) => entry.id)
}

function knownOnBothEnds(songs: readonly UserSong[], knownIds: ReadonlySet<number>): boolean {
  const first = songs[0]
  const last = songs[songs.length - 1]
  return (
    first !== undefined && last !== undefined && knownIds.has(first.id) && knownIds.has(last.id)
  )
}

function adjacentUnknowns(songs: readonly UserSong[], unknownIds: ReadonlySet<number>): boolean {
  for (let index = 1; index < songs.length; index += 1) {
    const previous = songs[index - 1]
    const current = songs[index]
    if (previous && current && unknownIds.has(previous.id) && unknownIds.has(current.id)) {
      return true
    }
  }
  return false
}

function song(id: number, title: string, tags: UserTag[] = [chip('feeling', 'Warm')]): UserSong {
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

function chip(kind: UserTag['kind'], name: string, applied = false): UserTag {
  return {
    kind,
    name,
    token: name.toLowerCase(),
    applied_by_me: applied,
  }
}
