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

export function orderTagSongs(songs: readonly UserSong[]): UserSong[] {
  const open: UserSong[] = []
  const waiting: UserSong[] = []
  for (const song of songs) {
    if (promptChips(song).length > 0) {
      open.push(song)
    } else {
      waiting.push(song)
    }
  }
  return [...open, ...waiting]
}
