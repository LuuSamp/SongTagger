import { Button } from '../../components/ui/Button'
import type { Playlist } from '../../domain/library'
import type { SpotifyExportState } from '../../hooks/useSpotifyExport'
import { SkippedSongs, SpotifyConnect, SpotifyMark } from './SpotifyConnect'
import styles from './Spotify.module.css'

interface SpotifyExportButtonProps {
  playlist: Playlist
  busy: boolean
  onExport: () => void
}

export function SpotifyExportButton({ playlist, busy, onExport }: SpotifyExportButtonProps) {
  return (
    <Button variant="ghost" onClick={onExport} busy={busy}>
      <SpotifyMark />
      {busy ? 'Sending…' : playlist.spotify_playlist_id ? 'Update on Spotify' : 'Export to Spotify'}
    </Button>
  )
}

interface SpotifyExportStatusProps {
  state: SpotifyExportState
  onDismiss: () => void
}

export function SpotifyExportStatus({ state, onDismiss }: SpotifyExportStatusProps) {
  if (state.kind === 'idle' || state.kind === 'busy') {
    return null
  }
  return (
    <div className={styles.result} role="status">
      <div className={styles.resultHeader}>
        {state.kind === 'done' ? (
          <p>
            {state.updated ? 'Updated the Spotify playlist.' : 'Created a new Spotify playlist.'}{' '}
            <a className={styles.link} href={state.result.url} target="_blank" rel="noreferrer">
              Open in Spotify ↗
            </a>
          </p>
        ) : state.kind === 'error' ? (
          <p className={styles.error} role="alert">
            {state.message}
          </p>
        ) : (
          <SpotifyConnect description="Connect your Spotify account to send this playlist there." />
        )}
        <Button variant="ghost" onClick={onDismiss} aria-label="Dismiss">
          ×
        </Button>
      </div>
      {state.kind === 'done' ? (
        <SkippedSongs
          verb="found on Spotify"
          items={state.result.skipped.map((song, index) => ({
            key: `${song.song_id}-${index}`,
            title: song.title,
            artist_credit: song.artist_credit,
          }))}
        />
      ) : null}
    </div>
  )
}
