import type { CSSProperties, ReactNode } from 'react'
import type { Tag } from '../../domain/types'
import { hashSeed, paletteForSong } from './artworkPalette'
import styles from './SongArtwork.module.css'

interface ArtworkSong {
  id: number
  title: string
  image_url?: string | null
  tags?: Tag[]
}

interface SongArtworkProps {
  song: ArtworkSong
  variant?: 'card' | 'thumb' | 'hero' | 'tile'
  children?: ReactNode
}

export function SongArtwork({ song, variant = 'card', children }: SongArtworkProps) {
  const palette = paletteForSong({ id: song.id, title: song.title, tags: song.tags ?? [] })
  const seed = hashSeed(`${song.id}:${song.title}`)
  const orbX = 30 + (seed % 45)
  const orbY = 28 + ((seed >> 5) % 30)
  const orbR = 18 + ((seed >> 10) % 14)
  const waveShift = (seed >> 3) % 40
  const ringCount = 3 + ((seed >> 7) % 3)

  const style = {
    '--art-base': palette.base,
    '--art-glow': palette.glow,
    '--art-accent': palette.accent,
    '--art-ink': palette.ink,
  } as CSSProperties

  return (
    <div className={`${styles.artwork} ${styles[variant]}`} style={style}>
      {song.image_url ? (
        <img className={styles.photo} src={song.image_url} alt="" />
      ) : (
        <svg
          className={styles.canvas}
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <circle cx={orbX} cy={orbY} r={orbR} fill="var(--art-accent)" opacity="0.85" />
          {Array.from({ length: ringCount }, (_, index) => (
            <circle
              key={index}
              cx={orbX}
              cy={orbY}
              r={orbR + 6 + index * 5}
              fill="none"
              stroke="var(--art-glow)"
              strokeWidth="0.5"
              opacity={0.5 - index * 0.08}
            />
          ))}
          {Array.from({ length: 5 }, (_, index) => {
            const y = 62 + index * 6
            return (
              <path
                key={index}
                d={`M-10 ${y} C 20 ${y - 10 + (waveShift % 7)}, 45 ${y + 12}, 70 ${y - 2} S 110 ${y - 8}, 120 ${y}`}
                fill="none"
                stroke="var(--art-ink)"
                strokeWidth="0.6"
                opacity={0.28 + index * 0.06}
              />
            )
          })}
        </svg>
      )}
      {children ? <div className={styles.overlay}>{children}</div> : null}
    </div>
  )
}
