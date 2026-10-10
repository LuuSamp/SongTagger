import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from '../../components/ui/Skeleton'
import { songPath } from '../../domain/songs'
import { sharedTags } from '../../domain/tags'
import type { CatalogSong } from '../../domain/types'
import { useSimilarSongs } from '../../hooks/useSimilarSongs'
import { SongArtwork } from './SongArtwork'
import styles from './SimilarSongs.module.css'

const LIMIT = 4

interface SimilarSongsProps {
  song: CatalogSong
}

export function SimilarSongs({ song }: SimilarSongsProps) {
  const { state } = useSimilarSongs(song, LIMIT)
  const [openId, setOpenId] = useState<number | null>(null)

  if (state.status === 'idle' || state.status === 'error') {
    return null
  }

  const similar = state.data
  const ready = similar !== null

  if (ready && similar.length === 0) {
    return null
  }

  return (
    <section className={styles.section} aria-labelledby="similar-title">
      <h2 id="similar-title" className={styles.heading}>
        Similar songs
      </h2>
      <ul className={styles.list} aria-busy={state.status === 'loading' || undefined}>
        {!ready
          ? Array.from({ length: LIMIT }, (_, index) => (
              <li key={index} className={styles.item}>
                <Skeleton width={56} height={56} radius="var(--radius-sm)" />
                <span className={styles.text}>
                  <Skeleton width="80%" height="0.9rem" />
                  <Skeleton width="55%" height="0.8rem" />
                </span>
              </li>
            ))
          : similar.map((candidate) => {
              const reasons = sharedTags(candidate.tags, song.tags)
              const open = openId === candidate.id
              const reasonId = `why-${candidate.id}`
              return (
                <li key={candidate.id} className={styles.item}>
                  <Link
                    to={songPath(candidate)}
                    className={styles.thumbLink}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <SongArtwork song={candidate} variant="thumb" />
                  </Link>
                  <span className={styles.text}>
                    <Link to={songPath(candidate)} className={styles.title}>
                      {candidate.artist_credit}
                    </Link>
                    <span className={styles.subtitle}>{candidate.title}</span>
                    <button
                      type="button"
                      className={styles.why}
                      aria-expanded={open}
                      aria-controls={reasonId}
                      onClick={() => setOpenId(open ? null : candidate.id)}
                    >
                      Why?
                    </button>
                    <span id={reasonId} className={styles.reason} hidden={!open}>
                      Shares {reasons.map((tag) => tag.name).join(', ')}
                    </span>
                  </span>
                </li>
              )
            })}
      </ul>
    </section>
  )
}
