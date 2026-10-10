import { useState } from 'react'
import { useLibrary } from '../../app/contexts'
import { Button } from '../../components/ui/Button'
import { brandColor } from '../songs/sourceBrands'
import { SourceIcon } from '../songs/SourceIcon'
import styles from './Spotify.module.css'

export function SpotifyMark({ size = 16 }: { size?: number }) {
  return (
    <span className={styles.mark} style={{ color: brandColor('spotify') }}>
      <SourceIcon sourceName="spotify" size={size} />
    </span>
  )
}

export function SpotifyConnect({ description }: { description: string }) {
  const { spotifyConnectUrl } = useLibrary()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      window.location.assign(await spotifyConnectUrl())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the Spotify connection.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.connect}>
      <p className={styles.muted}>{description}</p>
      <Button variant="secondary" onClick={connect} busy={busy}>
        <SpotifyMark />
        Connect Spotify
      </Button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface SkippedItem {
  key: string
  title: string
  artist_credit: string
}

export function SkippedSongs({ items, verb }: { items: readonly SkippedItem[]; verb: string }) {
  if (items.length === 0) {
    return null
  }
  return (
    <details className={styles.skipped}>
      <summary>
        {items.length} {items.length === 1 ? 'song was' : 'songs were'} not {verb}
      </summary>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <span className={styles.skippedTitle}>{item.title}</span>
            <span className={styles.muted}>{item.artist_credit}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
