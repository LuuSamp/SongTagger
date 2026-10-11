import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLibrary } from '../app/contexts'
import { discoverPath, songQueryFromParams, type DiscoverQuery } from '../app/routes'
import { PageShell } from '../components/layout/PageShell'
import { Button } from '../components/ui/Button'
import { StateMessage } from '../components/ui/StateMessage'
import { featuredVibes } from '../config/vibes'
import type { Recommendations } from '../domain/types'
import { topInterests } from '../domain/interests'
import { distinctSongIds } from '../domain/library'
import { SearchPanel } from '../features/discovery/SearchPanel'
import { SearchResults } from '../features/discovery/SearchResults'
import { SongShelf } from '../features/discovery/SongShelf'
import type { AsyncState } from '../hooks/useAsync'
import { usePlaylistSongs } from '../hooks/usePlaylistSongs'
import { useShelves, type Shelf, type ShelfRequest } from '../hooks/useShelves'
import { useRecommendations } from '../hooks/useRecommendations'
import { useSongSearch } from '../hooks/useSongSearch'
import styles from './DiscoverPage.module.css'

const SEARCH_INPUT_ID = 'discover-search'
const SONGS_PER_SHELF = 5
const VISIBLE_SHELVES = 3
const CANDIDATE_INTERESTS = 6
const PLAYLIST_SONGS_SAMPLED = 12
const PICKED_FOR_YOU = 10

interface ShelfCopy {
  eyebrow: string
  title: string
}

export function DiscoverPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const paramsKey = params.toString()
  const query = useMemo(() => songQueryFromParams(new URLSearchParams(paramsKey)), [paramsKey])
  const search = useSongSearch(query)

  function handleSearch(next: DiscoverQuery | undefined) {
    navigate(discoverPath(next))
  }

  return (
    <PageShell>
      <header className={styles.intro}>
        <h1 className={styles.title}>Discovery</h1>
        <p className={styles.subtitle}>
          Songs picked from the tags you love. Search any tag to wander further.
        </p>
      </header>

      <div className={styles.content}>
        <SearchPanel query={query} onSearch={handleSearch} inputId={SEARCH_INPUT_ID} />
        {query ? (
          <SearchResults query={query} state={search.state} onRetry={search.reload} />
        ) : (
          <ForYou />
        )}
      </div>
    </PageShell>
  )
}

function ForYou() {
  const { status: libraryStatus, playlists, favorites, favoritesStatus } = useLibrary()
  const favoriteIds = useMemo(() => favorites.map((song) => song.song_id), [favorites])
  const playlistSongIds = useMemo(
    () =>
      [...new Set([...favoriteIds, ...distinctSongIds(playlists, PLAYLIST_SONGS_SAMPLED)])].slice(
        0,
        PLAYLIST_SONGS_SAMPLED,
      ),
    [favoriteIds, playlists],
  )
  const playlistSongs = usePlaylistSongs(playlistSongIds)
  const sampledSongs = playlistSongs.state.data
  const interests = useMemo(
    () => topInterests(sampledSongs ?? [], CANDIDATE_INTERESTS),
    [sampledSongs],
  )
  const personalized = interests.length > 0
  const deciding =
    libraryStatus === 'loading' ||
    favoritesStatus === 'loading' ||
    (playlistSongIds.length > 0 && sampledSongs === null)

  const { requests, copy } = useMemo(() => {
    const copyById = new Map<string, ShelfCopy>()
    const shelfRequests: ShelfRequest[] = personalized
      ? interests.map((interest) => {
          copyById.set(interest.token, { eyebrow: 'Because you like', title: interest.name })
          return { id: interest.token, token: interest.token }
        })
      : featuredVibes.map((vibe) => {
          copyById.set(vibe.id, { eyebrow: 'Start with a vibe', title: vibe.title })
          return { id: vibe.id, token: vibe.query }
        })
    return { requests: shelfRequests, copy: copyById }
  }, [interests, personalized])

  const excludeIds = useMemo(
    () =>
      personalized ? [...favoriteIds, ...distinctSongIds(playlists, Number.MAX_SAFE_INTEGER)] : [],
    [favoriteIds, playlists, personalized],
  )
  const { state, reload } = useShelves(deciding ? [] : requests, excludeIds, SONGS_PER_SHELF)
  const shelves = visibleShelves(requests, state.data, personalized)
  const libraryKey = useMemo(
    () =>
      [
        favoriteIds.join(','),
        playlists.map((playlist) => playlist.songs.map((song) => song.song_id).join(',')).join(';'),
      ].join('|'),
    [favoriteIds, playlists],
  )
  const picked = useRecommendations(PICKED_FOR_YOU, libraryKey, !deciding)

  if (deciding) {
    return (
      <p className={styles.status} role="status">
        Looking at your playlists…
      </p>
    )
  }

  return (
    <section className={styles.forYou} aria-label="For you">
      <PickedForYou state={picked.state} />
      {personalized ? null : (
        <StateMessage
          title="Make Discovery yours"
          description="Favorite songs or add them to a playlist, and this page will follow the tags you return to most. Until then, here are some vibes to start from."
        />
      )}
      {state.status === 'error' ? (
        <StateMessage
          tone="error"
          title="We could not load your shelves"
          description={state.error.message}
          action={
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          }
        />
      ) : shelves.length === 0 ? (
        <StateMessage
          title="You have heard it all, for now"
          description="Every song sharing your favorite tags is already in your favorites or playlists. Search a new tag above to branch out."
        />
      ) : (
        shelves.map(({ request, songs }) => {
          const text = copy.get(request.id)
          return (
            <SongShelf
              key={request.id}
              id={request.id}
              eyebrow={text?.eyebrow ?? ''}
              title={text?.title ?? request.token}
              seeAllHref={discoverPath({ tags: [request.token] })}
              songs={songs}
              highlightTokens={[request.token]}
            />
          )
        })
      )}
    </section>
  )
}

function visibleShelves(
  requests: readonly ShelfRequest[],
  loaded: readonly Shelf[] | null,
  hideEmpty: boolean,
): Array<{ request: ShelfRequest; songs: Shelf['songs'] | null }> {
  if (!loaded) {
    return requests.slice(0, VISIBLE_SHELVES).map((request) => ({ request, songs: null }))
  }
  return requests
    .map((request) => ({
      request,
      songs: loaded.find((shelf) => shelf.id === request.id)?.songs ?? [],
    }))
    .filter((entry) => !hideEmpty || entry.songs.length > 0)
    .slice(0, VISIBLE_SHELVES)
}

function PickedForYou({ state }: { state: AsyncState<Recommendations> }) {
  const songs = useMemo(() => state.data?.songs.map((item) => item.song) ?? null, [state.data])
  const notes = useMemo(
    () =>
      new Map(
        (state.data?.songs ?? [])
          .filter((item) => item.because.length > 0)
          .map((item) => [
            item.song.id,
            `Because ${item.because.map((tag) => tag.name).join(' · ')}`,
          ]),
      ),
    [state.data],
  )
  const tokens = useMemo(
    () => [
      ...new Set((state.data?.songs ?? []).flatMap((item) => item.because.map((tag) => tag.token))),
    ],
    [state.data],
  )
  if (state.status === 'idle' || state.status === 'error') {
    return null
  }
  if (state.status === 'success' && state.data.songs.length === 0) {
    return null
  }
  return (
    <SongShelf
      id="picked-for-you"
      eyebrow="Picked for you"
      title="From everything you tag, save and love"
      songs={state.status === 'success' ? songs : null}
      highlightTokens={tokens}
      notes={notes}
    />
  )
}
