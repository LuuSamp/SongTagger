import type { SongSummary } from './library'
import type { Tag, TagKind } from './types'

export interface Interest {
  token: string
  name: string
  kind: TagKind
  songCount: number
}

const KIND_WEIGHT: Record<TagKind, number> = {
  genre: 4,
  feeling: 3,
  instrument: 2,
  artist: 1,
}

function byPreference(a: Tag, b: Tag): number {
  return KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind] || a.token.localeCompare(b.token)
}

export function topInterests(songs: readonly SongSummary[], limit = 3): Interest[] {
  const byToken = new Map<string, Interest>()
  for (const song of songs) {
    for (const tag of new Map(song.tags.map((entry) => [entry.token, entry])).values()) {
      const existing = byToken.get(tag.token)
      if (existing) {
        existing.songCount += 1
      } else {
        byToken.set(tag.token, { token: tag.token, name: tag.name, kind: tag.kind, songCount: 1 })
      }
    }
  }

  const chosen: Interest[] = []
  const take = (token: string) => {
    const interest = byToken.get(token)
    if (interest && chosen.length < limit && !chosen.includes(interest)) {
      chosen.push(interest)
    }
  }

  const shared = [...byToken.values()]
    .filter((interest) => interest.songCount > 1)
    .sort(
      (a, b) =>
        b.songCount - a.songCount ||
        KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind] ||
        a.token.localeCompare(b.token),
    )
  for (const interest of shared) {
    take(interest.token)
  }

  const queues = songs.map((song) => [...song.tags].sort(byPreference))
  let progressed = true
  while (chosen.length < limit && progressed) {
    progressed = false
    for (const queue of queues) {
      const next = queue.find((tag) => !chosen.some((interest) => interest.token === tag.token))
      if (next && chosen.length < limit) {
        take(next.token)
        progressed = true
      }
    }
  }

  return chosen
}
