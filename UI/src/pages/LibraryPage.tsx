import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLibrary } from '../app/contexts'
import {
  APP_PATHS,
  libraryPath,
  songQueryFromParams,
  type DiscoverQuery,
  type LibraryTab,
} from '../app/routes'
import { PageShell } from '../components/layout/PageShell'
import { Button, ButtonLink } from '../components/ui/Button'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Skeleton } from '../components/ui/Skeleton'
import { StateMessage } from '../components/ui/StateMessage'
import { filterSongs, topTags } from '../domain/favoritesSearch'
import { favoriteSongSummary, type Playlist, type SongSummary } from '../domain/library'
import { SearchPanel } from '../features/discovery/SearchPanel'
import { PlaylistCard } from '../features/library/PlaylistCard'
import { PlaylistTrackList } from '../features/library/PlaylistTrackList'
import { SpotifyExportButton, SpotifyExportStatus } from '../features/library/SpotifyExportButton'
import { SpotifyImportPanel } from '../features/library/SpotifyImportPanel'
import { SongGrid, SongGridSkeleton } from '../features/songs/SongGrid'
import { usePlaylistSongs } from '../hooks/usePlaylistSongs'
import { useSpotifyExport } from '../hooks/useSpotifyExport'
import styles from './LibraryPage.module.css'

const NAME_LIMIT = 255
const FAVORITES_SEARCH_ID = 'favorites-search'
const SUGGESTION_POOL_SIZE = 24

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
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const paramsKey = params.toString()
  const query = useMemo(() => songQueryFromParams(new URLSearchParams(paramsKey)), [paramsKey])
  const favoriteIds = useMemo(() => favorites.map((song) => song.song_id), [favorites])
  const detailed = usePlaylistSongs(favoriteIds)
  const tagged = detailed.state.data
  const suggestions = useMemo(() => {
    if (!tagged) {
      return []
    }
    const narrowed = query?.mode === 'tags' ? filterSongs(tagged, query) : tagged
    return topTags(narrowed, SUGGESTION_POOL_SIZE)
  }, [tagged, query])

  function search(next: DiscoverQuery | undefined) {
    navigate(libraryPath('favorites', undefined, next))
  }

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

  const songs: SongSummary[] = tagged ?? favorites.map(favoriteSongSummary)
  const byTags = query?.mode === 'tags'
  const tagsFailed = byTags && detailed.state.status === 'error'
  const waiting = byTags && !tagged && !tagsFailed
  const matches = filterSongs(songs, query)

  let results = <SongGrid songs={matches} />
  if (tagsFailed) {
    results = (
      <StateMessage
        tone="error"
        title="We could not load the tags of your favorites"
        description="Tag search needs each song's tags. Try again in a moment."
        action={
          <Button variant="secondary" onClick={detailed.reload}>
            Try again
          </Button>
        }
      />
    )
  } else if (waiting) {
    results = <SongGridSkeleton count={4} />
  } else if (query && matches.length === 0) {
    results = (
      <StateMessage
        title="No favorites match"
        description={
          byTags
            ? 'None of your favorites has all of these tags. Remove one or try another.'
            : 'None of your favorites has that title or artist.'
        }
        action={
          <Button variant="secondary" onClick={() => search(undefined)}>
            Clear search
          </Button>
        }
      />
    )
  } else if (query) {
    results = (
      <SongGrid
        songs={matches}
        highlightTokens={query.mode === 'tags' ? query.tokens : undefined}
      />
    )
  }

  return (
    <div className={styles.favorites}>
      <SearchPanel
        query={query}
        onSearch={search}
        inputId={FAVORITES_SEARCH_ID}
        suggestions={suggestions}
        titleNote="Filters your favorites by title and artist."
      />
      {query && !waiting && !tagsFailed ? (
        <p className={styles.matchCount} role="status">
          {matches.length} of {favorites.length} favorites match
        </p>
      ) : null}
      {results}
    </div>
  )
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
