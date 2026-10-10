import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FavoriteSong, SongSummary } from '../domain/library'
import {
  FavoritesUnsupportedError,
  LibraryUnavailableError,
  type LibraryService,
} from '../services/library'

export type FavoritesStatus = 'loading' | 'ready' | 'unsupported' | 'unavailable' | 'error'

export interface FavoritesState {
  favoritesStatus: FavoritesStatus
  favoritesError: string | null
  favorites: FavoriteSong[]
  favoriteActionError: string | null
  isFavorite: (songId: number) => boolean
  toggleFavorite: (song: SongSummary) => Promise<boolean>
  reloadFavorites: () => void
}

function statusFor(error: unknown): FavoritesStatus {
  if (error instanceof FavoritesUnsupportedError) {
    return 'unsupported'
  }
  return error instanceof LibraryUnavailableError ? 'unavailable' : 'error'
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useFavoritesState(service: LibraryService): FavoritesState {
  const [favoritesStatus, setStatus] = useState<FavoritesStatus>(
    service.kind === 'unavailable' ? 'unavailable' : 'loading',
  )
  const [favoritesError, setError] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<FavoriteSong[]>([])
  const [favoriteActionError, setActionError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const requestRef = useRef(0)

  useEffect(() => {
    const request = ++requestRef.current
    service.listFavorites().then(
      ({ songs }) => {
        if (request === requestRef.current) {
          setFavorites(songs)
          setError(null)
          setStatus('ready')
        }
      },
      (error: unknown) => {
        if (request === requestRef.current) {
          setError(messageOf(error, 'Could not load your favorites.'))
          setStatus(statusFor(error))
        }
      },
    )
  }, [service, version])

  const isFavorite = useCallback(
    (songId: number) => favorites.some((song) => song.song_id === songId),
    [favorites],
  )

  const toggleFavorite = useCallback(
    async (song: SongSummary) => {
      const previous = favorites
      const wasFavorite = previous.some((entry) => entry.song_id === song.id)
      setActionError(null)
      setFavorites(
        wasFavorite
          ? previous.filter((entry) => entry.song_id !== song.id)
          : [
              {
                song_id: song.id,
                title: song.title,
                artist_credit: song.artist_credit,
                favorited_at: new Date().toISOString(),
              },
              ...previous,
            ],
      )
      try {
        if (wasFavorite) {
          await service.removeFavorite(song.id)
        } else {
          const saved = await service.addFavorite(song.id)
          setFavorites((current) =>
            current.map((entry) => (entry.song_id === saved.song_id ? saved : entry)),
          )
        }
        return true
      } catch (error) {
        setFavorites(previous)
        setActionError(messageOf(error, 'Could not update your favorites.'))
        if (error instanceof FavoritesUnsupportedError) {
          setStatus('unsupported')
        }
        return false
      }
    },
    [favorites, service],
  )

  const reloadFavorites = useCallback(() => setVersion((value) => value + 1), [])

  return useMemo(
    () => ({
      favoritesStatus,
      favoritesError,
      favorites,
      favoriteActionError,
      isFavorite,
      toggleFavorite,
      reloadFavorites,
    }),
    [
      favoritesStatus,
      favoritesError,
      favorites,
      favoriteActionError,
      isFavorite,
      toggleFavorite,
      reloadFavorites,
    ],
  )
}
