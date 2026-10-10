import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { containsSong, firstMembership, movedMembershipIds, type Playlist } from '../domain/library'
import { LibraryUnavailableError, type LibraryService } from '../services/library'
import { LibraryContext, type LibraryActions, type LibraryStatus } from './contexts'

interface LibraryProviderProps {
  service: LibraryService
  children: ReactNode
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function replacePlaylist(playlists: Playlist[], next: Playlist): Playlist[] {
  return playlists.some((playlist) => playlist.id === next.id)
    ? playlists.map((playlist) => (playlist.id === next.id ? next : playlist))
    : [...playlists, next]
}

export function LibraryProvider({ service, children }: LibraryProviderProps) {
  const [status, setStatus] = useState<LibraryStatus>(
    service.kind === 'unavailable' ? 'unavailable' : 'loading',
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [version, setVersion] = useState(0)
  const requestRef = useRef(0)

  useEffect(() => {
    if (service.kind === 'unavailable') {
      setStatus('unavailable')
      return
    }
    const request = ++requestRef.current
    setStatus((current) => (current === 'ready' ? current : 'loading'))
    service
      .listPlaylists()
      .then(({ playlists: summaries }) =>
        Promise.all(summaries.map((summary) => service.getPlaylist(summary.id))),
      )
      .then(
        (loaded) => {
          if (request === requestRef.current) {
            setPlaylists(loaded)
            setLoadError(null)
            setStatus('ready')
          }
        },
        (error: unknown) => {
          if (request === requestRef.current) {
            setLoadError(messageOf(error, 'Could not load your playlists.'))
            setStatus(error instanceof LibraryUnavailableError ? 'unavailable' : 'error')
          }
        },
      )
  }, [service, version])

  const reload = useCallback(() => setVersion((value) => value + 1), [])

  const run = useCallback(
    async <T,>(action: () => Promise<T>, fallback: string): Promise<T | null> => {
      setActionError(null)
      setPendingCount((count) => count + 1)
      try {
        return await action()
      } catch (error) {
        setActionError(messageOf(error, fallback))
        return null
      } finally {
        setPendingCount((count) => count - 1)
      }
    },
    [],
  )

  const createPlaylist = useCallback(
    async (name: string) => {
      const created = await run(
        () => service.createPlaylist(name),
        'Could not create the playlist.',
      )
      if (created) {
        setPlaylists((current) => replacePlaylist(current, created))
      }
      return created
    },
    [run, service],
  )

  const renamePlaylist = useCallback(
    async (playlistId: number, name: string) => {
      const renamed = await run(
        () => service.renamePlaylist(playlistId, name),
        'Could not rename the playlist.',
      )
      if (renamed) {
        setPlaylists((current) => replacePlaylist(current, renamed))
      }
      return renamed !== null
    },
    [run, service],
  )

  const deletePlaylist = useCallback(
    async (playlistId: number) => {
      const done = await run(
        () => service.deletePlaylist(playlistId).then(() => true),
        'Could not delete the playlist.',
      )
      if (done) {
        setPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId))
      }
      return done === true
    },
    [run, service],
  )

  const addSong = useCallback(
    async (playlistId: number, songId: number) => {
      const updated = await run(
        () => service.addSong(playlistId, songId),
        'Could not add the song to the playlist.',
      )
      if (updated) {
        setPlaylists((current) => replacePlaylist(current, updated))
      }
      return updated !== null
    },
    [run, service],
  )

  const removeMembership = useCallback(
    async (playlistId: number, membershipId: number) => {
      const updated = await run(
        () =>
          service.removeSong(playlistId, membershipId).then(() => service.getPlaylist(playlistId)),
        'Could not remove the song from the playlist.',
      )
      if (updated) {
        setPlaylists((current) => replacePlaylist(current, updated))
      }
      return updated !== null
    },
    [run, service],
  )

  const removeSong = useCallback(
    async (playlistId: number, songId: number) => {
      const playlist = playlists.find((entry) => entry.id === playlistId)
      const membership = playlist ? firstMembership(playlist, songId) : null
      return membership ? removeMembership(playlistId, membership.membership_id) : false
    },
    [playlists, removeMembership],
  )

  const moveSong = useCallback(
    async (playlistId: number, membershipId: number, offset: -1 | 1) => {
      const playlist = playlists.find((entry) => entry.id === playlistId)
      const order = playlist ? movedMembershipIds(playlist, membershipId, offset) : null
      if (!order) {
        return false
      }
      const updated = await run(
        () => service.reorder(playlistId, order),
        'Could not reorder the playlist.',
      )
      if (updated) {
        setPlaylists((current) => replacePlaylist(current, updated))
      }
      return updated !== null
    },
    [playlists, run, service],
  )

  const value = useMemo<LibraryActions>(
    () => ({
      kind: service.kind,
      status,
      loadError,
      playlists,
      actionError,
      pending: pendingCount > 0,
      reload,
      clearActionError: () => setActionError(null),
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addSong,
      removeSong,
      removeMembership,
      moveSong,
      playlistsContaining: (songId) =>
        playlists.filter((playlist) => containsSong(playlist, songId)),
    }),
    [
      service.kind,
      status,
      loadError,
      playlists,
      actionError,
      pendingCount,
      reload,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addSong,
      removeSong,
      removeMembership,
      moveSong,
    ],
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}
