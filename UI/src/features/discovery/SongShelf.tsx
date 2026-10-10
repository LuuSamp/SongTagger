import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from '../../components/ui/Skeleton'
import type { SongSummary } from '../../domain/library'
import { SongCard } from '../songs/SongCard'
import styles from './SongShelf.module.css'

interface SongShelfProps {
  id: string
  eyebrow: string
  title: ReactNode
  seeAllHref: string
  songs: readonly SongSummary[] | null
  highlightTokens?: readonly string[]
  placeholderCount?: number
}

export function SongShelf({
  id,
  eyebrow,
  title,
  seeAllHref,
  songs,
  highlightTokens,
  placeholderCount = 5,
}: SongShelfProps) {
  const headingId = `shelf-${id}`
  return (
    <section className={styles.shelf} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.title}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          {title}
        </h2>
        <Link to={seeAllHref} className={styles.seeAll}>
          See all
        </Link>
      </div>
      {songs === null ? (
        <ul className={styles.row} aria-hidden="true">
          {Array.from({ length: placeholderCount }, (_, index) => (
            <li key={index} className={styles.placeholder}>
              <Skeleton height="auto" className={styles.placeholderArt} radius="var(--radius-md)" />
              <Skeleton width="70%" height="1rem" />
              <Skeleton width="45%" height="0.85rem" />
            </li>
          ))}
        </ul>
      ) : songs.length === 0 ? (
        <p className={styles.empty}>Nothing new here yet.</p>
      ) : (
        <ul className={styles.row}>
          {songs.map((song) => (
            <li key={song.id}>
              <SongCard song={song} highlightTokens={highlightTokens} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
