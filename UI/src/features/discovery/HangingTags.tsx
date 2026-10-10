import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { discoverPath } from '../../app/routes'
import { TagChip } from '../../components/ui/TagChip'
import type { ShowcaseSong } from '../../config/showcase'
import { TAG_KIND_COLORS } from '../../domain/tags'
import { SongArtwork } from '../songs/SongArtwork'
import styles from './HangingTags.module.css'
import { WindLayer } from './WindLayer'

const HANG = [
  { drop: 18, tilt: -2.5, delay: 0, anchor: 8 },
  { drop: 44, tilt: 1.5, delay: -2.4, anchor: 16 },
  { drop: 8, tilt: 2.5, delay: -4.1, anchor: 8 },
]

interface HangingTagsProps {
  songs: readonly ShowcaseSong[]
}

export function HangingTags({ songs }: HangingTagsProps) {
  return (
    <figure className={styles.scene}>
      <figcaption className={styles.caption}>
        Every song wears the tags its listeners give it.
      </figcaption>
      <div className={styles.stage}>
        <WindLayer />
        <svg
          className={styles.string}
          viewBox="0 0 600 40"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 10 C 150 34, 450 34, 600 10" />
        </svg>
        <ul className={styles.tags}>
          {songs.map((song, index) => {
            const hang = HANG[index % HANG.length] ?? { drop: 16, tilt: 0, delay: 0, anchor: 8 }
            const searchPath = discoverPath({ title: song.title, artist: song.artist })
            return (
              <li
                key={song.title}
                className={styles.hanger}
                style={
                  {
                    '--drop': `${hang.drop}px`,
                    '--tilt': `${hang.tilt}deg`,
                    '--delay': `${hang.delay}s`,
                    '--anchor': `${hang.anchor}px`,
                  } as CSSProperties
                }
              >
                <article className={styles.paper}>
                  <span className={styles.hole} aria-hidden="true" />
                  <Link
                    to={searchPath}
                    className={styles.coverLink}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <SongArtwork song={{ id: song.seed, title: song.title, tags: song.tags }} />
                  </Link>
                  <div className={styles.meta}>
                    <h3 className={styles.title}>
                      <Link to={searchPath}>{song.title}</Link>
                    </h3>
                    <p className={styles.artist}>{song.artist}</p>
                  </div>
                  <ul className={styles.chips} aria-label={`Tags on ${song.title}`}>
                    {song.tags.map((tag) => (
                      <li key={tag.token}>
                        <TagChip
                          label={tag.name}
                          size="sm"
                          marker={TAG_KIND_COLORS[tag.kind]}
                          to={discoverPath({ tags: [tag.token] })}
                          title={`Find songs tagged ${tag.name}`}
                        />
                      </li>
                    ))}
                  </ul>
                </article>
              </li>
            )
          })}
        </ul>
      </div>
    </figure>
  )
}
