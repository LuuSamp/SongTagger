import { useState } from 'react'
import { useLibrary } from '../app/contexts'
import type { Playlist, SpotifyExportResult } from '../domain/library'
import { SpotifyNotConnectedError } from '../services/library'

export type SpotifyExportState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'not-connected' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; result: SpotifyExportResult; updated: boolean }

export function useSpotifyExport(playlist: Playlist) {
  const { exportToSpotify } = useLibrary()
  const [state, setState] = useState<SpotifyExportState>({ kind: 'idle' })

  async function run() {
    const updated = Boolean(playlist.spotify_playlist_id)
    setState({ kind: 'busy' })
    try {
      setState({ kind: 'done', result: await exportToSpotify(playlist.id), updated })
    } catch (error) {
      setState(
        error instanceof SpotifyNotConnectedError
          ? { kind: 'not-connected' }
          : {
              kind: 'error',
              message:
                error instanceof Error && error.message
                  ? error.message
                  : 'Could not export this playlist.',
            },
      )
    }
  }

  return { state, run, dismiss: () => setState({ kind: 'idle' }) }
}
