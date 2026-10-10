import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLibrary } from '../app/contexts'
import { APP_PATHS, libraryPath, type LibraryTab } from '../app/routes'
import { PageShell } from '../components/layout/PageShell'
import { Button, ButtonLink } from '../components/ui/Button'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Skeleton } from '../components/ui/Skeleton'
import { StateMessage } from '../components/ui/StateMessage'
import { favoriteSongSummary, type Playlist } from '../domain/library'
import { PlaylistCard } from '../features/library/PlaylistCard'
import { PlaylistTrackList } from '../features/library/PlaylistTrackList'
import { SpotifyExportButton, SpotifyExportStatus } from '../features/library/SpotifyExportButton'
import { SpotifyImportPanel } from '../features/library/SpotifyImportPanel'
import { SongGrid, SongGridSkeleton } from '../features/songs/SongGrid'
import { useSpotifyExport } from '../hooks/useSpotifyExport'
import styles from './LibraryPage.module.css'

const NAME_LIMIT = 255

const TABS = [
  { value: 'playlists' as const, label: 'Playlists' },
  { value: 'favorites' as const, label: 'Favorites' },
]

type SpotifyReturn = 'connected' | 'error' | null

export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab: LibraryTab = params.get('tab') === 'favorites' ? 'favorites' : 'playlists'
  const selectedId = Number(params.get('playlist')) || null
  const spotifyParam = params.get('spotify')
  const [spotifyReturn, setSpotifyReturn] = useState<SpotifyReturn>(
    spotifyParam === 'connected' || spotifyParam === 'error' ? spotifyParam : null,
  )

  useEffect(() => {
    if (spotifyParam !== null) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('spotify')
          return next
        },
        { replace: true },
      )
    }
  }, [spotifyParam, setParams])

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
      {spotifyReturn ? (
        <div
          className={spotifyReturn === 'connected' ? styles.notice : styles.noticeError}
          role={spotifyReturn === 'connected' ? 'status' : 'alert'}
        >
          <p>
            {spotifyReturn === 'connected'
              ? 'Spotify is connected. You can now import and export playlists.'
              : 'Spotify did not finish connecting. Try again from “Import from Spotify”.'}
          </p>
          <Button variant="ghost" onClick={() => setSpotifyReturn(null)} aria-label="Dismiss">
            ×
          </Button>
        </div>
      ) : null}
      {tab === 'favorites' ? (
        <Favorites />
      ) : (
        <Playlists selectedId={selectedId} openImport={spotifyReturn === 'connected'} />
      )}
    </PageShell>
  )
}

function Favorites() {
  const { favoritesStatus, favoritesError, favorites, reloadFavorites } = useLibrary()

  if (favoritesStatus === 'unsupported' || favoritesStatus === 'unavailable') {
    return (
      <StateMessage
        title="Favorites are not available yet"
        description={
          favoritesStatus === 'unsupported'
            ? 'This is a planned feature. The SongTagger API does not have favorites endpoints yet (GET, PUT and DELETE on /user/{id}/favorite). The heart on song pages turns on as soon as they exist. Until then, use playlists to keep the songs you love.'
            : 'Favorites need the SongTagger API. Run the app with VITE_DATA_SOURCE=http.'
        }
      />
    )
  }

  if (favoritesStatus === 'error') {
    return (
      <StateMessage
        tone="error"
        title="We could not load your favorites"
        description={favoritesError}
        action={
          <Button variant="secondary" onClick={reloadFavorites}>
            Try again
          </Button>
        }
      />
    )
  }

  if (favoritesStatus === 'loading') {
    return <SongGridSkeleton count={4} />
  }

  if (favorites.length === 0) {
    return (
      <StateMessage
        title="No favorites yet"
        description="Tap the heart on any song page to keep it here."
        action={
          <ButtonLink to={APP_PATHS.discover} variant="secondary">
            Go to Discovery
          </ButtonLink>
        }
      />
    )
  }

  return <SongGrid songs={favorites.map(favoriteSongSummary)} />
}

function Playlists({ selectedId, openImport }: { selectedId: number | null; openImport: boolean }) {
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
        <SpotifyImportPanel initiallyOpen={openImport} />
        {playlists.length === 0 ? (
          <p className={styles.muted}>
            No playlists yet. Create one here, import one from Spotify, or add songs from any song
            page.
          </p>
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
  const { deletePlaylist, renamePlaylist, pending, actionError, clearActionError } = useLibrary()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(playlist.name)
  const spotifyExport = useSpotifyExport(playlist)
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
            <SpotifyExportButton
              playlist={playlist}
              busy={spotifyExport.state.kind === 'busy'}
              onExport={spotifyExport.run}
            />
            <Button variant="ghost" onClick={startRename}>
              Rename
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete playlist
            </Button>
          </div>
        )}
      </div>
      <SpotifyExportStatus state={spotifyExport.state} onDismiss={spotifyExport.dismiss} />
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
        <PlaylistTrackList playlist={playlist} />
      )}
    </section>
  )
}
