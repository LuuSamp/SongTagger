import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { APP_PATHS, parseSongId } from '../app/routes'
import { OrganicBackdrop } from '../components/layout/OrganicBackdrop'
import { PageShell } from '../components/layout/PageShell'
import { Button, ButtonLink } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { StateMessage } from '../components/ui/StateMessage'
import { catalogSources, formatDuration, listeningSources } from '../domain/songs'
import type { TagKind, UserSong } from '../domain/types'
import { AddToPlaylist } from '../features/library/AddToPlaylist'
import { FavoriteButton } from '../features/library/FavoriteButton'
import { SimilarSongs } from '../features/songs/SimilarSongs'
import { SongArtwork } from '../features/songs/SongArtwork'
import { SourceLinks } from '../features/songs/SourceLinks'
import { AddTagForm } from '../features/tags/AddTagForm'
import { TagKindFilter, type TagKindSelection } from '../features/tags/TagKindFilter'
import { TagList } from '../features/tags/TagList'
import { useSong } from '../hooks/useSong'
import { useTagMutations } from '../hooks/useTagMutations'
import { ApiError } from '../services/http/httpClient'
import styles from './SongPage.module.css'

export function SongPage() {
  const { songId: rawId } = useParams()
  const songId = parseSongId(rawId)
  const { state, setData, reload } = useSong(songId)

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
    <PageShell backdrop={<OrganicBackdrop />}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link to={APP_PATHS.discover}>← Discovery</Link>
      </nav>
      {state.data && state.data.id === songId ? (
        <SongDetail key={state.data.id} song={state.data} update={setData} reload={reload} />
      ) : (
        <SongDetailSkeleton />
      )}
    </PageShell>
  )
}

interface SongDetailProps {
  song: UserSong
  update: (change: (song: UserSong) => UserSong) => void
  reload: () => void
}

function SongDetail({ song, update, reload }: SongDetailProps) {
  const [kindFilter, setKindFilter] = useState<TagKindSelection>('all')
  const tagging = useTagMutations({ songId: song.id, update, reload })
  const duration = formatDuration(song.duration_ms)
  const presentKinds = useMemo(
    () => [...new Set(song.tags.map((tag) => tag.kind))] as TagKind[],
    [song.tags],
  )
  const visibleTags =
    kindFilter === 'all' ? song.tags : song.tags.filter((tag) => tag.kind === kindFilter)
  const listenOn = listeningSources(song.sources)
  const catalogued = catalogSources(song.sources)

  return (
    <article className={styles.layout}>
      <div className={styles.primary}>
        <SongArtwork song={song} variant="hero">
          <p className={styles.artTitle}>{song.title}</p>
          <p className={styles.artArtist}>{song.artist_credit}</p>
          {song.disambiguation ? <p className={styles.artMeta}>{song.disambiguation}</p> : null}
        </SongArtwork>

        <section className={styles.tags} aria-labelledby="tags-title">
          <div className={styles.tagsHeader}>
            <h2 id="tags-title" className={styles.sectionTitle}>
              Tags <span>Artist • Genre • Feeling • Instrument</span>
            </h2>
            {presentKinds.length > 1 ? (
              <TagKindFilter kinds={presentKinds} value={kindFilter} onChange={setKindFilter} />
            ) : null}
          </div>
          {song.tags.length === 0 ? (
            <p className={styles.muted}>No tags yet. Be the first to describe this song.</p>
          ) : (
            <TagList
              tags={visibleTags}
              pendingKeys={tagging.pendingKeys}
              onRemove={tagging.removeTag}
            />
          )}
          <AddTagForm
            onAdd={tagging.addTag}
            error={tagging.error}
            onDismissError={tagging.clearError}
          />
        </section>
      </div>

      <div className={styles.secondary}>
        <header className={styles.heading}>
          <h1 className={styles.title}>{song.title}</h1>
          <p className={styles.byline}>
            {song.artist_credit}
            {duration ? <span> · {duration}</span> : null}
          </p>
        </header>

        <div className={styles.actions}>
          <FavoriteButton song={song} />
          <AddToPlaylist song={song} />
        </div>

        <SourceLinks label="Listen on:" sources={listenOn} />

        <div className={styles.more}>
          <svg
            className={styles.wave}
            viewBox="0 0 400 40"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 22 C 40 6, 70 36, 110 20 S 180 6, 220 22 S 300 38, 340 18 S 390 12, 400 20" />
            <path d="M0 26 C 50 14, 80 34, 120 24 S 190 12, 230 26 S 310 34, 350 22 S 392 18, 400 24" />
          </svg>

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
