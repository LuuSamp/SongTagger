import { Link } from 'react-router-dom'
import { discoverPath } from '../../app/routes'
import type { Vibe } from '../../config/vibes'
import styles from './VibeList.module.css'
import { vibeStyle } from './vibeStyle'

interface VibeListProps {
  vibes: readonly Vibe[]
}

export function VibeList({ vibes }: VibeListProps) {
  return (
    <nav aria-labelledby="vibe-list-title" className={styles.wrapper}>
      <h2 id="vibe-list-title" className={styles.heading}>
        Explore by vibe
      </h2>
      <ul className={styles.list}>
        {vibes.map((vibe) => (
          <li key={vibe.id}>
            <Link
              to={discoverPath({ tags: [vibe.query] })}
              className={styles.card}
              style={vibeStyle(vibe)}
            >
              <span className={styles.text}>
                <span className={styles.title}>{vibe.title}</span>
                <span className={styles.description}>{vibe.description}</span>
              </span>
              <span className={styles.cta} aria-hidden="true">
                Explore
                <br />
                this vibe
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
