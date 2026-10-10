import { useCallback, useState } from 'react'
import { useCatalog } from '../app/contexts'
import { displayTagName, sortTags, tagKey, toToken } from '../domain/tags'
import type { TagWrite, UserSong, UserTag } from '../domain/types'

interface UseTagMutationsOptions {
  songId: number
  update: (change: (song: UserSong) => UserSong) => void
  reload: () => void
}

function withTag(song: UserSong, tag: UserTag): UserSong {
  const key = tagKey(tag)
  const exists = song.tags.some((current) => tagKey(current) === key)
  const tags = exists
    ? song.tags.map((current) =>
        tagKey(current) === key ? { ...current, applied_by_me: true } : current,
      )
    : sortTags([...song.tags, tag])
  return { ...song, tags }
}

function withoutMyTag(song: UserSong, tag: TagWrite): UserSong {
  const key = tagKey(tag)
  return { ...song, tags: song.tags.filter((current) => tagKey(current) !== key) }
}

export function useTagMutations({ songId, update, reload }: UseTagMutationsOptions) {
  const catalog = useCatalog()
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const track = useCallback((key: string, active: boolean) => {
    setPendingKeys((current) => {
      const next = new Set(current)
      if (active) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }, [])

  const addTag = useCallback(
    async (write: TagWrite): Promise<boolean> => {
      const token = toToken(write.token)
      if (!token) {
        setError('Type a tag before adding it.')
        return false
      }
      const name = displayTagName(write.token)
      const local = { kind: write.kind, token }
      const key = tagKey(local)
      setError(null)
      track(key, true)
      update((song) => withTag(song, { ...local, name, applied_by_me: true }))
      try {
        const saved = await catalog.addTag(songId, {
          kind: write.kind,
          token: name.replace(/ /g, '-'),
        })
        update((song) => withTag(withoutMyTag(song, local), saved))
        return true
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not add the tag.')
        reload()
        return false
      } finally {
        track(key, false)
      }
    },
    [catalog, reload, songId, track, update],
  )

  const removeTag = useCallback(
    async (tag: UserTag) => {
      const request = { kind: tag.kind, token: tag.token }
      const key = tagKey(request)
      setError(null)
      track(key, true)
      try {
        await catalog.removeTag(songId, request)
        reload()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not remove the tag.')
      } finally {
        track(key, false)
      }
    },
    [catalog, reload, songId, track],
  )

  return { addTag, removeTag, pendingKeys, error, clearError: () => setError(null) }
}
