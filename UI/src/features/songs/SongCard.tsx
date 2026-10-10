import { Link } from 'react-router-dom'
import { songPath } from '../../domain/songs'
import { isAppliedByMe } from '../../domain/tags'
import type { SongSummary } from '../../domain/library'
import { SongArtwork } from './SongArtwork'
import styles from './SongCard.module.css'

interface SongCardProps {
  song: SongSummary
  highlightTokens?: readonly string[]
}

const VISIBLE_TAGS = 3

export function SongCard({ song, highlightTokens = [] }: SongCardProps) {
  const highlight = new Set(highlightTokens)
  const tags = [...song.tags]
    .filter((tag) => tag.kind !== 'artist')
    .sort((a, b) => Number(highlight.has(b.token)) - Number(highlight.has(a.token)))
    .slice(0, VISIBLE_TAGS)

  return (
    <article className={styles.card}>
      <Link to={songPath(song)} className={styles.link}>
        <SongArtwork song={song} />
        <div className={styles.body}>
          <h3 className={styles.title}>{song.title}</h3>
          <p className={styles.artist}>{song.artist_credit}</p>
        </div>
      </Link>
      {tags.length > 0 ? (
        <ul className={styles.tags} aria-label="Tags">
          {tags.map((tag) => (
            <li
              key={`${tag.kind}:${tag.token}`}
              className={[
                styles.tag,
                highlight.has(tag.token) ? styles.matched : null,
                isAppliedByMe(tag) ? styles.mine : null,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {tag.name}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}
