import { Skeleton } from '../../components/ui/Skeleton'
import type { SongSummary } from '../../domain/library'
import { SongCard } from './SongCard'
import styles from './SongGrid.module.css'

interface SongGridProps {
  songs: readonly SongSummary[]
  highlightTokens?: readonly string[]
}

export function SongGrid({ songs, highlightTokens }: SongGridProps) {
  return (
    <ul className={styles.grid}>
      {songs.map((song) => (
        <li key={song.id}>
          <SongCard song={song} highlightTokens={highlightTokens} />
        </li>
      ))}
    </ul>
  )
}

export function SongGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className={styles.grid} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={styles.skeletonCard}>
          <Skeleton height="auto" className={styles.skeletonArt} radius="var(--radius-md)" />
          <Skeleton width="70%" height="1rem" />
          <Skeleton width="45%" height="0.85rem" />
        </li>
      ))}
    </ul>
  )
}
