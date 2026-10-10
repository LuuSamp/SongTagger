import { Link } from 'react-router-dom'
import styles from './BrandMark.module.css'

const BARS = [
  { x: 4, height: 6 },
  { x: 8, height: 12 },
  { x: 12, height: 16 },
  { x: 16, height: 10 },
  { x: 20, height: 6 },
]

interface BrandMarkProps {
  to: string
  showWordmark?: boolean
}

export function BrandMark({ to, showWordmark = false }: BrandMarkProps) {
  return (
    <Link to={to} className={styles.brand} aria-label="SongTagger">
      <span className={styles.mark} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20">
          {BARS.map((bar) => (
            <rect
              key={bar.x}
              x={bar.x - 1}
              y={12 - bar.height / 2}
              width="2"
              height={bar.height}
              rx="1"
              fill="currentColor"
            />
          ))}
        </svg>
      </span>
      {showWordmark ? <span className={styles.wordmark}>SongTagger</span> : null}
    </Link>
  )
}
