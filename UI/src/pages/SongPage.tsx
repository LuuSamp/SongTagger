import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { APP_PATHS, parseSongId } from '../app/routes'
import { OrganicBackdrop } from '../components/layout/OrganicBackdrop'
import { PageShell } from '../components/layout/PageShell'
import { Button, ButtonLink } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { StateMessage } from '../components/ui/StateMessage'
import { sceneForSong, type SceneChoice } from '../domain/scenes'
import { catalogSources, formatDuration, listeningSources } from '../domain/songs'
import type { UserSong } from '../domain/types'
import { AddToPlaylist } from '../features/library/AddToPlaylist'
import { FavoriteButton } from '../features/library/FavoriteButton'
import { SimilarSongs } from '../features/songs/SimilarSongs'
import { CoverPlayer } from '../features/songs/CoverPlayer'
import { PlaybackWave } from '../features/songs/PlaybackWave'
import { SceneLabel } from '../features/songs/SceneLabel'
import { SourceLinks } from '../features/songs/SourceLinks'
import { SongTagsPanel } from '../features/tags/SongTagsPanel'
import { useSong } from '../hooks/useSong'
import { useTagMutations } from '../hooks/useTagMutations'
import { ApiError } from '../services/http/httpClient'
import styles from './SongPage.module.css'

export function SongPage() {
  const { songId: rawId } = useParams()
  const songId = parseSongId(rawId)
  const { state, setData, reload } = useSong(songId)
  const [playing, setPlaying] = useState(false)
  const loaded = state.data && state.data.id === songId ? state.data : null
  const choice = useMemo<SceneChoice>(
    () => (loaded ? sceneForSong(loaded.tags) : { scene: 'daylight', reason: null }),
    [loaded],
  )

  if (
    songId === null ||
    (state.status === 'error' && state.error instanceof ApiError && state.error.status === 404)
  ) {
    return (
      <PageShell>
        <StateMessage
          title="This song is not in the catalog"
          description="The link may be wrong, or the song was never imported."
          action={
            <ButtonLink to={APP_PATHS.discover} variant="secondary">
              Back to Discovery
            </ButtonLink>
          }
        />
      </PageShell>
    )
  }

  if (state.status === 'error') {
    return (
      <PageShell>
        <StateMessage
          tone="error"
          title="We could not load this song"
          description={state.error.message}
          action={
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          }
        />
      </PageShell>
    )
  }

  return (
    <PageShell backdrop={<OrganicBackdrop playing={playing} scene={choice.scene} />}>
      <div className={styles.scene} data-scene={choice.scene}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link to={APP_PATHS.discover}>← Discovery</Link>
        </nav>
        {loaded ? (
          <SongDetail
            key={loaded.id}
            song={loaded}
            update={setData}
            reload={reload}
            playing={playing}
            onPlayingChange={setPlaying}
            choice={choice}
          />
        ) : (
          <SongDetailSkeleton />
        )}
      </div>
    </PageShell>
  )
}

interface SongDetailProps {
  song: UserSong
  update: (change: (song: UserSong) => UserSong) => void
  reload: () => void
  playing: boolean
  onPlayingChange: (playing: boolean) => void
  choice: SceneChoice
}

function SongDetail({ song, update, reload, playing, onPlayingChange, choice }: SongDetailProps) {
  const tagging = useTagMutations({ songId: song.id, update, reload })
  const duration = formatDuration(song.duration_ms)
  const listenOn = listeningSources(song.sources)
  const catalogued = catalogSources(song.sources)

  return (
    <article className={styles.layout}>
      <div className={styles.primary}>
        <div className={styles.cover}>
          <CoverPlayer song={song} onPlayingChange={onPlayingChange}>
            <p className={styles.artTitle}>{song.title}</p>
            <p className={styles.artArtist}>{song.artist_credit}</p>
            {song.disambiguation ? <p className={styles.artMeta}>{song.disambiguation}</p> : null}
          </CoverPlayer>
          <div className={styles.coverActions} role="group" aria-label="Save this song">
            <FavoriteButton song={song} />
            <AddToPlaylist songId={song.id} songTitle={song.title} />
          </div>
        </div>

        <div className={styles.tags}>
          <SongTagsPanel tags={song.tags} tagging={tagging} />
        </div>
      </div>

      <div className={styles.secondary}>
        <header className={styles.heading}>
          <h1 className={styles.title}>{song.title}</h1>
          <p className={styles.byline}>
            {song.artist_credit}
            {duration ? <span> · {duration}</span> : null}
          </p>
        </header>

        <SourceLinks label="Listen on:" sources={listenOn} />

        <div className={styles.more}>
          <div className={styles.mood}>
            <SceneLabel choice={choice} />
            <PlaybackWave className={styles.wave} playing={playing} scene={choice.scene} />
          </div>

          <section className={styles.about} aria-labelledby="about-title">
            <h2 id="about-title" className={styles.sectionTitle}>
              About this song
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Tagged by the community as</dt>
                <dd>
                  {song.tags
                    .filter((tag) => tag.kind !== 'artist')
                    .slice(0, 4)
                    .map((tag) => tag.name)
                    .join(' · ') || 'Nothing yet'}
                </dd>
              </div>
              {song.isrc ? (
                <div>
                  <dt>ISRC</dt>
                  <dd>{song.isrc}</dd>
                </div>
              ) : null}
              {duration ? (
                <div>
                  <dt>Length</dt>
                  <dd>{duration}</dd>
                </div>
              ) : null}
            </dl>
            <SourceLinks label="Catalogued on:" sources={catalogued} />
          </section>

          <hr className={styles.divider} />

          <SimilarSongs song={song} />
        </div>
      </div>
    </article>
  )
}

function SongDetailSkeleton() {
  return (
    <div className={styles.layout} aria-busy="true" role="status">
      <span className="visually-hidden">Loading song</span>
      <div className={styles.primary}>
        <Skeleton height="auto" radius="var(--radius-lg)" className={styles.artSkeleton} />
        <Skeleton width="40%" height="1.4rem" />
        <Skeleton width="90%" height="2.2rem" radius="var(--radius-pill)" />
      </div>
      <div className={styles.secondary}>
        <Skeleton width="80%" height="3rem" />
        <Skeleton width="50%" height="1.2rem" />
        <Skeleton width="60%" height="1rem" />
      </div>
    </div>
  )
}
