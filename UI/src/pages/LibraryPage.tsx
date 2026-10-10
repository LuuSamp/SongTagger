import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLibrary } from '../app/contexts'
import { libraryPath, type LibraryTab } from '../app/routes'
import { PageShell } from '../components/layout/PageShell'
import { Button } from '../components/ui/Button'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Skeleton } from '../components/ui/Skeleton'
import { StateMessage } from '../components/ui/StateMessage'
import { playlistSongSummary, type Playlist } from '../domain/library'
import { songPath } from '../domain/songs'
import { PlaylistCard } from '../features/library/PlaylistCard'
import { SongArtwork } from '../features/songs/SongArtwork'
import styles from './LibraryPage.module.css'

const NAME_LIMIT = 255

const TABS = [
  { value: 'playlists' as const, label: 'Playlists' },
  { value: 'favorites' as const, label: 'Favorites' },
]

export function LibraryPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab: LibraryTab = params.get('tab') === 'favorites' ? 'favorites' : 'playlists'
  const selectedId = Number(params.get('playlist')) || null

  return (
    <PageShell>
      <header className={styles.header}>
        <h1 className={styles.title}>Library</h1>
        <SegmentedControl
          label="Library section"
          options={TABS}
          value={tab}
          onChange={(next) => navigate(libraryPath(next))}
        />
      </header>
      {tab === 'favorites' ? <FavoritesPending /> : <Playlists selectedId={selectedId} />}
    </PageShell>
  )
}

function FavoritesPending() {
  return (
    <StateMessage
      title="Favorites are not available yet"
      description="This is a planned feature. The SongTagger API has no favorites endpoints yet (the user_songs table exists but has no routes), so songs cannot be favorited for now. Use playlists to keep the songs you love."
    />
  )
}

function Playlists({ selectedId }: { selectedId: number | null }) {
  const { status, loadError, playlists, reload } = useLibrary()

  if (status === 'unavailable') {
    return (
      <StateMessage
        title="The Library needs the SongTagger API"
        description="Playlists are stored by the API. Start it with python -m API and run the UI with VITE_DATA_SOURCE=http."
      />
    )
  }

  if (status === 'error') {
    return (
      <StateMessage
        tone="error"
        title="We could not load your playlists"
        description={loadError}
        action={
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        }
      />
    )
  }

  if (status === 'loading') {
    return (
      <div className={styles.playlists} aria-busy="true" role="status">
        <span className="visually-hidden">Loading playlists</span>
        <div className={styles.sidebar}>
          <Skeleton height="2.5rem" radius="var(--radius-pill)" />
          <div className={styles.playlistGrid}>
            <Skeleton height="auto" className={styles.cardSkeleton} radius="var(--radius-md)" />
            <Skeleton height="auto" className={styles.cardSkeleton} radius="var(--radius-md)" />
          </div>
        </div>
      </div>
    )
  }

  const selected = playlists.find((playlist) => playlist.id === selectedId) ?? null

  return (
    <div className={styles.playlists}>
      <aside className={styles.sidebar}>
        <CreatePlaylistForm />
        {playlists.length === 0 ? (
          <p className={styles.muted}>No playlists yet. Create one here, or from any song page.</p>
        ) : (
          <ul className={styles.playlistGrid}>
            {playlists.map((playlist) => (
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
        ) : playlists.length > 0 ? (
          <p className={styles.muted}>Pick a playlist to see its songs.</p>
        ) : null}
      </div>
    </div>
  )
}

function CreatePlaylistForm() {
  const { createPlaylist, pending } = useLibrary()
  const navigate = useNavigate()
  const [name, setName] = useState('')

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const playlist = await createPlaylist(name)
    if (playlist) {
      setName('')
      navigate(libraryPath('playlists', playlist.id))
    }
  }

  return (
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
        maxLength={NAME_LIMIT}
        autoComplete="off"
      />
      <Button type="submit" disabled={!name.trim()} busy={pending}>
        Create
      </Button>
    </form>
  )
}

function PlaylistDetail({ playlist }: { playlist: Playlist }) {
  const {
    removeMembership,
    moveSong,
    deletePlaylist,
    renamePlaylist,
    pending,
    actionError,
    clearActionError,
  } = useLibrary()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(playlist.name)
  const created = new Date(playlist.created_at)

  async function handleDelete() {
    if (await deletePlaylist(playlist.id)) {
      navigate(libraryPath('playlists'))
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (await renamePlaylist(playlist.id, draftName)) {
      setRenaming(false)
    }
  }

  function startRename() {
    clearActionError()
    setDraftName(playlist.name)
    setRenaming(true)
  }

  return (
    <section
      className={styles.detailInner}
      aria-labelledby="playlist-title"
      aria-busy={pending || undefined}
    >
      <div className={styles.detailHeader}>
        {renaming ? (
          <form className={styles.renameForm} onSubmit={handleRename}>
            <label className="visually-hidden" htmlFor="rename-playlist">
              Playlist name
            </label>
            <input
              id="rename-playlist"
              className={styles.input}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={NAME_LIMIT}
              autoComplete="off"
              autoFocus
            />
            <Button type="submit" disabled={!draftName.trim()} busy={pending}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <div className={styles.titleBlock}>
            <h2 id="playlist-title" className={styles.playlistTitle}>
              {playlist.name}
            </h2>
            <p className={styles.muted}>
              {playlist.songs.length} {playlist.songs.length === 1 ? 'song' : 'songs'}
              {Number.isNaN(created.getTime())
                ? null
                : ` · created ${created.toLocaleDateString()}`}
            </p>
          </div>
        )}
        {renaming ? null : confirming ? (
          <div className={styles.confirm} role="group" aria-label="Confirm deletion">
            <span>Delete this playlist?</span>
            <Button variant="primary" onClick={handleDelete} busy={pending}>
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className={styles.headerActions}>
            <Button variant="ghost" onClick={startRename}>
              Rename
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete playlist
            </Button>
          </div>
        )}
      </div>
      {actionError ? (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      ) : null}
      {playlist.songs.length === 0 ? (
        <p className={styles.muted}>
          This playlist is empty. Use “+ Playlist” on a song page to add songs.
        </p>
      ) : (
        <ol className={styles.tracks}>
          {playlist.songs.map((song, index) => (
            <li key={song.membership_id} className={styles.track}>
              <span className={styles.trackIndex}>{song.position}</span>
              <SongArtwork song={playlistSongSummary(song)} variant="thumb" />
              <span className={styles.trackText}>
                <Link to={songPath({ id: song.song_id })} className={styles.trackTitle}>
                  {song.title}
                </Link>
                <span className={styles.trackArtist}>{song.artist_credit}</span>
              </span>
              <span className={styles.trackActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => moveSong(playlist.id, song.membership_id, -1)}
                  disabled={pending || index === 0}
                  aria-label={`Move ${song.title} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => moveSong(playlist.id, song.membership_id, 1)}
                  disabled={pending || index === playlist.songs.length - 1}
                  aria-label={`Move ${song.title} down`}
                >
                  ↓
                </button>
                <Button
                  variant="ghost"
                  onClick={() => removeMembership(playlist.id, song.membership_id)}
                  disabled={pending}
                  aria-label={`Remove ${song.title} from ${playlist.name}`}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
