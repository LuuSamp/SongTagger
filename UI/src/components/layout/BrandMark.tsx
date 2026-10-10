import { useId } from 'react'
import { Link } from 'react-router-dom'
import styles from './BrandMark.module.css'

const TAG_OUTLINE =
  'M14 3H50a4 4 0 0 1 4 4V33a4 4 0 0 1-4 4H14a4 4 0 0 1-3-1.4L2.6 22.6a4 4 0 0 1 0-5.2L11 4.4A4 4 0 0 1 14 3Z'

interface BrandMarkProps {
  to: string
  showWordmark?: boolean
}

export function BrandMark({ to, showWordmark = false }: BrandMarkProps) {
  const holeMaskId = `tag-hole${useId().replace(/:/g, '')}`

  return (
    <Link to={to} className={styles.brand} aria-label="SongTagger home">
      <svg className={styles.mark} viewBox="0 0 56 40" aria-hidden="true">
        <defs>
          <mask id={holeMaskId}>
            <rect width="56" height="40" fill="white" />
            <circle cx="10.5" cy="20" r="2.6" fill="black" />
          </mask>
        </defs>
        <path className={styles.tag} d={TAG_OUTLINE} mask={`url(#${holeMaskId})`} />
        <text className={styles.initials} x="33.5" y="27.2" textAnchor="middle">
          S<tspan className={styles.slash}>/</tspan>T
        </text>
      </svg>
      {showWordmark ? <span className={styles.wordmark}>SongTagger</span> : null}
    </Link>
  )
}
