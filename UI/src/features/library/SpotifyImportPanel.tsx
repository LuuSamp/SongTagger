import { useCallback, useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../../app/contexts'
import { libraryPath } from '../../app/routes'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import {
  smallestCover,
  type SpotifyImportResult,
  type SpotifyPlaylistItem,
} from '../../domain/library'
import { SpotifyNotConnectedError } from '../../services/library'
import { SkippedSongs, SpotifyConnect, SpotifyMark } from './SpotifyConnect'
import styles from './Spotify.module.css'

type ListState =
  | { kind: 'loading' }
  | { kind: 'not-connected' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; playlists: SpotifyPlaylistItem[] }

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function SpotifyImportPanel({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const { playlists, listSpotifyPlaylists, importFromSpotify } = useLibrary()
  const navigate = useNavigate()
  const panelId = useId()
  const [open, setOpen] = useState(initiallyOpen)
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [version, setVersion] = useState(0)
  const [importing, setImporting] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [result, setResult] = useState<SpotifyImportResult | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    let active = true
    setList({ kind: 'loading' })
    listSpotifyPlaylists().then(
      ({ playlists: items }) => active && setList({ kind: 'ready', playlists: items }),
      (error: unknown) =>
        active &&
        setList(
          error instanceof SpotifyNotConnectedError
            ? { kind: 'not-connected' }
            : {
                kind: 'error',
                message: messageOf(error, 'Could not load your Spotify playlists.'),
              },
        ),
    )
    return () => {
      active = false
    }
  }, [open, version, listSpotifyPlaylists])

  const linkedIds = new Set(
    playlists.flatMap((playlist) =>
      playlist.spotify_playlist_id ? [playlist.spotify_playlist_id] : [],
    ),
  )

  const handleImport = useCallback(
    async (item: SpotifyPlaylistItem) => {
      setImporting(item.spotify_playlist_id)
      setImportError(null)
      try {
        const imported = await importFromSpotify(item.spotify_playlist_id)
        setResult(imported)
        setOpen(false)
        navigate(libraryPath('playlists', imported.playlist.id))
      } catch (error) {
        if (error instanceof SpotifyNotConnectedError) {
          setList({ kind: 'not-connected' })
        } else {
          setImportError(messageOf(error, 'Could not import this playlist.'))
        }
      } finally {
        setImporting(null)
      }
    },
    [importFromSpotify, navigate],
  )

  function toggle() {
    setImportError(null)
    setOpen((value) => !value)
  }

  return (
    <section className={styles.importBlock} aria-label="Spotify import">
      <Button
        variant="secondary"
        className={styles.importTrigger}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <SpotifyMark />
        Import from Spotify
      </Button>

      {result && !open ? (
        <div className={styles.result} role="status">
          <div className={styles.resultHeader}>
            <p>
              Imported <strong>{result.playlist.name}</strong> with {result.playlist.songs.length}{' '}
              {result.playlist.songs.length === 1 ? 'song' : 'songs'}.
            </p>
            <Button variant="ghost" onClick={() => setResult(null)} aria-label="Dismiss">
              ×
            </Button>
          </div>
          <SkippedSongs
            verb="imported"
            items={result.skipped.map((track, index) => ({
              key: `${track.spotify_id ?? 'local'}-${index}`,
              title: track.title,
              artist_credit: track.artist_credit,
            }))}
          />
        </div>
      ) : null}

      {open ? (
        <div id={panelId} className={styles.panel} aria-busy={list.kind === 'loading' || undefined}>
          <p className={styles.heading}>Your Spotify playlists</p>
          {list.kind === 'loading' ? (
            <div className={styles.rows} role="status">
              <span className="visually-hidden">Loading Spotify playlists</span>
              <Skeleton height="3rem" radius="var(--radius-sm)" />
              <Skeleton height="3rem" radius="var(--radius-sm)" />
              <Skeleton height="3rem" radius="var(--radius-sm)" />
            </div>
          ) : list.kind === 'not-connected' ? (
            <SpotifyConnect description="Connect your Spotify account to bring your playlists here." />
          ) : list.kind === 'error' ? (
            <div className={styles.connect}>
              <p className={styles.error}>{list.message}</p>
              <Button variant="secondary" onClick={() => setVersion((value) => value + 1)}>
                Try again
              </Button>
            </div>
          ) : list.playlists.length === 0 ? (
            <p className={styles.muted}>No playlists on this Spotify account yet.</p>
          ) : (
            <ul className={styles.rows}>
              {list.playlists.map((item) => {
                const cover = smallestCover(item.images)
                const linked = linkedIds.has(item.spotify_playlist_id)
                const busy = importing === item.spotify_playlist_id
                return (
                  <li key={item.spotify_playlist_id}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => handleImport(item)}
                      disabled={importing !== null}
                      aria-busy={busy || undefined}
                      title={
                        linked ? 'Replace the linked local playlist' : 'Import as a new playlist'
                      }
                    >
                      {cover ? (
                        <img className={styles.cover} src={cover} alt="" loading="lazy" />
                      ) : (
                        <span className={styles.cover} aria-hidden="true">
                          <SpotifyMark size={18} />
                        </span>
                      )}
                      <span className={styles.rowName}>{item.name}</span>
                      <span className={styles.rowAction}>
                        {busy ? 'Importing…' : linked ? 'Update' : 'Import'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {importError ? (
            <p className={styles.error} role="alert">
              {importError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
