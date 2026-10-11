import type { Playlist } from './library'
import type { UserSong, UserTag } from './types'

const PROMPT_KINDS = new Set<UserTag['kind']>(['feeling', 'instrument'])

export function promptChips(song: UserSong): UserTag[] {
  return song.tags.filter((tag) => PROMPT_KINDS.has(tag.kind) && !tag.applied_by_me)
}

export function librarySongIds(
  favorites: readonly { song_id: number }[],
  playlists: readonly Pick<Playlist, 'songs'>[],
): number[] {
  const ids: number[] = []
  const seen = new Set<number>()

  function push(id: number) {
    if (seen.has(id)) {
      return
    }
    seen.add(id)
    ids.push(id)
  }

  for (const favorite of favorites) {
    push(favorite.song_id)
  }
  for (const playlist of playlists) {
    const songs = [...playlist.songs].sort((a, b) => a.position - b.position)
    for (const entry of songs) {
      push(entry.song_id)
    }
  }
  return ids
}

export type RandomSource = () => number

export function orderTagSongs(
  known: readonly UserSong[],
  recommendations: readonly UserSong[],
  random: RandomSource,
): UserSong[] {
  const saved = uniqueSongs(known)
  const savedIds = new Set(saved.map((entry) => entry.id))
  const fresh = uniqueSongs(recommendations).filter((entry) => !savedIds.has(entry.id))
  const open: UserSong[] = []
  const waiting: UserSong[] = []
  for (const entry of saved) {
    if (promptChips(entry).length > 0) {
      open.push(entry)
    } else {
      waiting.push(entry)
    }
  }
  return sprinkle(
    [...shuffle(open, random), ...shuffle(waiting, random)],
    shuffle(fresh, random),
    random,
  )
}

function uniqueSongs(songs: readonly UserSong[]): UserSong[] {
  const seen = new Set<number>()
  const unique: UserSong[] = []
  for (const entry of songs) {
    if (seen.has(entry.id)) {
      continue
    }
    seen.add(entry.id)
    unique.push(entry)
  }
  return unique
}

function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = copy[index]
    const swapped = copy[swapIndex]
    if (current === undefined || swapped === undefined) {
      continue
    }
    copy[index] = swapped
    copy[swapIndex] = current
  }
  return copy
}

function sprinkle(
  known: readonly UserSong[],
  unknown: readonly UserSong[],
  random: RandomSource,
): UserSong[] {
  if (known.length === 0) {
    return [...unknown]
  }
  const only = known[0]
  if (known.length === 1) {
    const follow = unknown[0]
    if (!only) {
      return []
    }
    return follow ? [only, follow] : [only]
  }
  const gapCount = known.length - 1
  const placed = unknown.slice(0, gapCount)
  if (placed.length === 0) {
    return [...known]
  }
  const gaps = gapIndexes(gapCount, placed.length, random)
  const result: UserSong[] = []
  let next = 0
  for (let index = 0; index < known.length; index += 1) {
    const current = known[index]
    if (current) {
      result.push(current)
    }
    if (index < gapCount && gaps.has(index)) {
      const pick = placed[next]
      if (pick) {
        result.push(pick)
      }
      next += 1
    }
  }
  return result
}

function gapIndexes(gapCount: number, count: number, random: RandomSource): Set<number> {
  const indexes = Array.from({ length: gapCount }, (_, index) => index)
  if (count >= gapCount) {
    return new Set(indexes)
  }
  return new Set(shuffle(indexes, random).slice(0, count))
}
