import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLibrary } from '../app/contexts'
import { APP_PATHS, libraryPath, type LibraryTab } from '../app/routes'
import { PageShell } from '../components/layout/PageShell'
import { Button, ButtonLink } from '../components/ui/Button'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { StateMessage } from '../components/ui/StateMessage'
import type { Playlist } from '../domain/library'
import { songPath } from '../domain/songs'
import { PlaylistCard } from '../features/library/PlaylistCard'
import { SongArtwork } from '../features/songs/SongArtwork'
import { SongGrid } from '../features/songs/SongGrid'
import styles from './LibraryPage.module.css'

const TABS = [
  { value: 'favorites' as const, label: 'Favorites' },
  { value: 'playlists' as const, label: 'Playlists' },
]

export function LibraryPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab: LibraryTab = params.get('tab') === 'playlists' ? 'playlists' : 'favorites'

  return (
    <PageShell>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Library</h1>
          <p className={styles.note}>Saved on this device only.</p>
        </div>
        <SegmentedControl
          label="Library section"
          options={TABS}
          value={tab}
          onChange={(next) => navigate(libraryPath(next))}
        />
      </header>
      {tab === 'favorites' ? <Favorites /> : <Playlists selectedId={params.get('playlist')} />}
    </PageShell>
  )
}

function Favorites() {
  const { library } = useLibrary()

  if (library.favorites.length === 0) {
    return (
      <StateMessage
        title="No favorites yet"
        description="Tap the heart on any song to keep it here. Your favorites also shape Discovery."
        action={
          <ButtonLink to={APP_PATHS.discover} variant="secondary">
            Go to Discovery
          </ButtonLink>
        }
      />
    )
  }

  return <SongGrid songs={library.favorites} />
}

function Playlists({ selectedId }: { selectedId: string | null }) {
  const { library, createPlaylist } = useLibrary()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const selected = library.playlists.find((playlist) => playlist.id === selectedId) ?? null

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const playlist = createPlaylist(name)
    if (playlist) {
      setName('')
      navigate(libraryPath('playlists', playlist.id))
    }
  }

  return (
    <div className={styles.playlists}>
      <aside className={styles.sidebar}>
        <form className={styles.create} onSubmit={handleCreate}>
          <label className="visually-hidden" htmlFor="new-playlist-name">
            New playlist name
          </label>
          <input
            id="new-playlist-name"
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New playlist name"
            maxLength={80}
            autoComplete="off"
          />
          <Button type="submit" disabled={!name.trim()}>
            Create
          </Button>
        </form>
        {library.playlists.length === 0 ? (
          <p className={styles.muted}>No playlists yet. Create one here, or from any song page.</p>
        ) : (
          <ul className={styles.playlistGrid}>
            {library.playlists.map((playlist) => (
              <li key={playlist.id}>
                <PlaylistCard playlist={playlist} selected={playlist.id === selected?.id} />
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className={styles.detail}>
        {selected ? (
          <PlaylistDetail key={selected.id} playlist={selected} />
        ) : library.playlists.length > 0 ? (
          <p className={styles.muted}>Pick a playlist to see its songs.</p>
        ) : null}
      </div>
    </div>
  )
}

function PlaylistDetail({ playlist }: { playlist: Playlist }) {
  const { removeFromPlaylist, deletePlaylist } = useLibrary()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  function handleDelete() {
    deletePlaylist(playlist.id)
    navigate(libraryPath('playlists'))
  }

  return (
    <section className={styles.detailInner} aria-labelledby="playlist-title">
      <div className={styles.detailHeader}>
        <h2 id="playlist-title" className={styles.playlistTitle}>
          {playlist.name}
        </h2>
        {confirming ? (
          <div className={styles.confirm} role="group" aria-label="Confirm deletion">
            <span>Delete this playlist?</span>
            <Button variant="primary" onClick={handleDelete}>
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Delete playlist
          </Button>
        )}
      </div>
      {playlist.songs.length === 0 ? (
        <p className={styles.muted}>
          This playlist is empty. Use “+ Playlist” on a song page to add songs.
        </p>
      ) : (
        <ol className={styles.tracks}>
          {playlist.songs.map((song, index) => (
            <li key={song.id} className={styles.track}>
              <span className={styles.trackIndex}>{index + 1}</span>
              <SongArtwork song={song} variant="thumb" />
              <span className={styles.trackText}>
                <Link to={songPath(song)} className={styles.trackTitle}>
                  {song.title}
                </Link>
                <span className={styles.trackArtist}>{song.artist_credit}</span>
              </span>
              <Button
                variant="ghost"
                onClick={() => removeFromPlaylist(playlist.id, song.id)}
                aria-label={`Remove ${song.title} from ${playlist.name}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
